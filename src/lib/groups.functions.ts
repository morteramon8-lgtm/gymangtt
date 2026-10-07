import { createServerFn } from "@tanstack/react-start";
import { requireActiveSubscription } from "@/integrations/supabase/subscription-middleware";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { LIMITS, zExercise, zNotes } from "./validation";

/*
 * Grupos de entrenamiento.
 *
 * Seguridad: cada función usa el cliente con la SESIÓN del usuario (nunca la
 * clave de servicio para leer/escribir datos). El gimnasio, el rol y la
 * pertenencia al grupo se validan en la base de datos (RLS + funciones
 * SECURITY DEFINER); aquí no se acepta ningún gym_id enviado por el cliente.
 */

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function isAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

const GROUP_NAME_MAX = 80;
const GROUP_DESCRIPTION_MAX = 500;

const zGroupName = z
  .string()
  .trim()
  .min(1, "Ponele un nombre al grupo")
  .max(GROUP_NAME_MAX, `El nombre puede tener hasta ${GROUP_NAME_MAX} caracteres.`);
const zGroupDescription = z
  .string()
  .trim()
  .max(GROUP_DESCRIPTION_MAX, `La descripción puede tener hasta ${GROUP_DESCRIPTION_MAX} caracteres.`)
  .nullish();
const zUserIds = z.array(z.string().uuid()).max(50, "Podés invitar hasta 50 personas por vez.");

/** Enlace temporal a la foto de un integrante. Sólo firma fotos de la carpeta de ESE socio y gimnasio. */
async function signedPhoto(
  path: string | null | undefined,
  gymId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!path || !memberId) return null;
  if (!path.startsWith(`gym/${gymId}/member/${memberId}/`) || path.includes("..")) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("member-photos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/* ------------------------------------------------------------------ lectura */

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireActiveSubscription])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    // RLS: el socio ve sólo sus grupos; el administrador, los de su gimnasio.
    const groups =
      unwrap(
        await ctx.supabase
          .from("training_groups")
          .select("id, name, description, created_at, training_group_members(count)")
          .order("created_at", { ascending: false }),
      ) ?? [];
    const mine =
      unwrap(
        await ctx.supabase
          .from("training_group_members")
          .select("group_id, role")
          .eq("user_id", ctx.userId),
      ) ?? [];
    const roleOf = new Map(mine.map((m) => [m.group_id, m.role]));
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      created_at: g.created_at,
      memberCount: (g.training_group_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      myRole: (roleOf.get(g.id) ?? null) as "owner" | "member" | null,
    }));
  });

export const getGroup = createServerFn({ method: "GET" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const group = unwrap(
      await ctx.supabase
        .from("training_groups")
        .select("id, gym_id, name, description, created_at, created_by")
        .eq("id", data.id)
        .maybeSingle(),
    );
    // Si no es integrante (o es de otro gimnasio) la base no devuelve nada.
    if (!group) throw new Error("Grupo no encontrado.");

    const admin = await isAdmin(ctx);
    const canManage = unwrap(await ctx.supabase.rpc("can_manage_group", { _group_id: group.id }));

    const memberRows = unwrap(await ctx.supabase.rpc("list_group_members", { _group_id: group.id })) ?? [];
    const members = await Promise.all(
      memberRows.map(async (m) => ({
        userId: m.user_id,
        role: m.role as "owner" | "member",
        firstName: m.first_name,
        lastName: m.last_name,
        isGymAdmin: m.is_gym_admin,
        isMe: m.user_id === ctx.userId,
        photoUrl: await signedPhoto(m.photo_url, group.gym_id, m.member_id),
      })),
    );
    const myRole = members.find((m) => m.isMe)?.role ?? null;
    const nameOf = new Map(members.map((m) => [m.userId, `${m.firstName} ${m.lastName}`.trim()]));

    const invitations = canManage
      ? ((unwrap(await ctx.supabase.rpc("list_group_invitations", { _group_id: group.id })) ?? []).map((i) => ({
          id: i.id,
          firstName: i.first_name,
          lastName: i.last_name,
          invitedBy: i.invited_by_name,
          createdAt: i.created_at,
        })))
      : [];

    const routineRows =
      unwrap(
        await ctx.supabase
          .from("routines")
          .select(
            "id, name, kind, notes, created_at, created_by, routine_exercises(id, name, sets, reps, weight, rest, position)",
          )
          .eq("group_id", group.id)
          .order("created_at", { ascending: false }),
      ) ?? [];
    const routines = routineRows.map((r) => {
      const mine = r.created_by === ctx.userId;
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        notes: r.notes,
        created_at: r.created_at,
        createdByName: (r.created_by && nameOf.get(r.created_by)) || null,
        exercises: [...(r.routine_exercises ?? [])].sort((a, b) => a.position - b.position),
        // Edita quien la creó o el administrador; elimina además el propietario del grupo.
        canEdit: (mine && myRole !== null) || admin,
        canDelete: (mine && myRole !== null) || canManage,
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        created_at: group.created_at,
      },
      myRole,
      canManage,
      members,
      invitations,
      routines,
    };
  });

/** Busca socios del PROPIO gimnasio para invitar. El gimnasio sale de la sesión, no del cliente. */
export const searchGroupCandidates = createServerFn({ method: "GET" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) =>
    z
      .object({
        query: z.string().trim().max(80).default(""),
        groupId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const rows =
      unwrap(
        await ctx.supabase.rpc("search_group_candidates", {
          _query: data.query,
          _group_id: data.groupId ?? null,
        }),
      ) ?? [];
    return rows.map((r) => ({ userId: r.user_id, firstName: r.first_name, lastName: r.last_name }));
  });

/* ---------------------------------------------------------------- escritura */

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) =>
    z.object({ name: zGroupName, description: zGroupDescription, inviteUserIds: zUserIds }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const res = unwrap(
      await ctx.supabase.rpc("create_training_group", {
        _name: data.name,
        _description: data.description ?? null,
        _invite_user_ids: data.inviteUserIds,
      }),
    ) as { id: string; invited: number };
    return { id: res.id, invited: res.invited };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), name: zGroupName, description: zGroupDescription }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    unwrap(
      await ctx.supabase.rpc("update_training_group", {
        _group_id: data.id,
        _name: data.name,
        _description: data.description ?? null,
      }),
    );
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    unwrap(await ctx.supabase.rpc("delete_training_group", { _group_id: data.id }));
    return { ok: true };
  });

export const inviteToGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) =>
    z.object({ groupId: z.string().uuid(), userIds: zUserIds.min(1, "Elegí al menos una persona.") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const res = unwrap(
      await ctx.supabase.rpc("invite_to_training_group", { _group_id: data.groupId, _user_ids: data.userIds }),
    ) as { invited: number };
    return { invited: res.invited };
  });

export const respondGroupInvitation = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ invitationId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const res = unwrap(
      await ctx.supabase.rpc("respond_group_invitation", {
        _invitation_id: data.invitationId,
        _accept: data.accept,
      }),
    ) as { status: "aceptada" | "rechazada"; group_id: string };
    return { status: res.status, groupId: res.group_id };
  });

export const cancelGroupInvitation = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ invitationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    unwrap(await ctx.supabase.rpc("cancel_group_invitation", { _invitation_id: data.invitationId }));
    return { ok: true };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const res = unwrap(await ctx.supabase.rpc("leave_training_group", { _group_id: data.id })) as {
      group_deleted: boolean;
    };
    return { groupDeleted: res.group_deleted };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ groupId: z.string().uuid(), userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    unwrap(await ctx.supabase.rpc("remove_group_member", { _group_id: data.groupId, _user_id: data.userId }));
    return { ok: true };
  });

/* ----------------------------------------------------------- rutinas de grupo */

const zGroupRoutine = z.object({
  groupId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Ponele un nombre a la rutina").max(LIMITS.routineNameMax),
  kind: z.string().trim().min(1).max(60),
  notes: zNotes,
  exercises: z
    .array(zExercise)
    .min(1, "Agregá al menos un ejercicio")
    .max(LIMITS.exercisesMax, `Una rutina puede tener hasta ${LIMITS.exercisesMax} ejercicios.`),
});

/** Crea (o edita, si trae `id`) una rutina del grupo. Reglas de acceso: en la base de datos. */
export const saveGroupRoutine = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => zGroupRoutine.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const exercises = data.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      weight: e.weight ?? null,
      rest: e.rest ?? null,
    })) as Json;
    const res = data.id
      ? unwrap(
          await ctx.supabase.rpc("update_group_routine", {
            _routine_id: data.id,
            _name: data.name,
            _kind: data.kind,
            _notes: data.notes ?? null,
            _exercises: exercises,
          }),
        )
      : unwrap(
          await ctx.supabase.rpc("create_group_routine", {
            _group_id: data.groupId,
            _name: data.name,
            _kind: data.kind,
            _notes: data.notes ?? null,
            _exercises: exercises,
          }),
        );
    return { id: (res as { id: string }).id };
  });

export const deleteGroupRoutine = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    unwrap(await ctx.supabase.rpc("delete_group_routine", { _routine_id: data.id }));
    return { ok: true };
  });
