import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE } from "./validation";
/**
 * Alta de gimnasios y de socios con "deshacer" seguro.
 *
 * Toda la secuencia (cuenta + registros relacionados) vive acá para que cada
 * paso deje anotado cómo deshacerse. Si un paso falla, se borra únicamente lo
 * que se creó en esa misma operación, nunca datos anteriores.
 */

export type Undo = () => Promise<void>;

export async function undoAll(steps: Undo[]) {
  for (const step of [...steps].reverse()) {
    try {
      await step();
    } catch (err) {
      console.error("No se pudo deshacer un paso de la operación:", err);
    }
  }
}

/** Traduce los choques de datos duplicados a un mensaje claro para la pantalla. */
export function duplicateMessage(message: string): string | null {
  if (/members_email_unique/.test(message)) return "Ya hay otro socio cargado con ese email.";
  if (/members_dni_unique/.test(message)) return "Ya hay otro socio cargado con ese DNI.";
  if (/members_user_id_key/.test(message))
    return "Esa cuenta ya está vinculada a otra ficha de socio.";
  if (/user_roles_user_id_role_key/.test(message)) return "Esa cuenta ya tiene ese rol asignado.";
  if (/gym_admins_user_id_key/.test(message))
    return "Esa cuenta ya es administradora de un gimnasio.";
  if (/duplicate key|already exists|already registered/i.test(message))
    return "Ese dato ya está cargado en el sistema.";
  return null;
}

export function friendlyError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(duplicateMessage(message) || message || "La operación no se pudo completar.");
}

/* ------------------------------------------------------------------ clientes */

type DbError = { message: string } | null;

type Filterable = {
  eq: (column: string, value: unknown) => Filterable & PromiseLike<{ error: DbError }>;
};

type Selectable = {
  eq: (column: string, value: unknown) => Selectable;
  maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: DbError }>;
  single: () => PromiseLike<{ data: { id: string } | null; error: DbError }>;
};

export type TableLike = {
  insert: (values: unknown) => PromiseLike<{ error: DbError }> & { select: (cols?: string) => Selectable };
  select: (cols?: string) => Selectable;
  delete: () => Filterable;
};

export type DbLike = { from: (table: string) => TableLike };

export type AdminLike = DbLike & {
  auth: {
    admin: {
      createUser: (payload: Record<string, unknown>) => PromiseLike<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
      deleteUser: (id: string) => PromiseLike<unknown>;
    };
  };
};

/* ------------------------------------------------------------------- helpers */

function authError(message: string, context: "gym" | "member"): Error {
  if (/weak|easy to guess|pwned|breach/i.test(message))
    return new Error(
      context === "gym"
        ? "Esa contraseña apareció en filtraciones conocidas o es demasiado fácil de adivinar. Elegí otra."
        : "Esa contraseña es demasiado común. Usá otra más difícil de adivinar (mezclá letras, números y símbolos).",
    );
  if (/already (been )?registered|already exists|email_exists/i.test(message))
    return new Error("Ya existe una cuenta con ese email.");
  return new Error(
    message || (context === "gym" ? "No se pudo crear la cuenta." : "No se pudo crear la cuenta del socio."),
  );
}

async function createAuthUser(
  admin: AdminLike,
  payload: Record<string, unknown>,
  context: "gym" | "member",
): Promise<string> {
  const created = await admin.auth.admin.createUser(payload);
  if (created.error) throw authError(created.error.message || "", context);
  const userId = created.data.user?.id;
  if (!userId) throw authError("", context);
  return userId;
}

/** Crea el perfil sólo si no existía, para no pisar datos previos. */
async function ensureProfile(
  db: DbLike,
  undo: Undo[],
  profile: { id: string; full_name: string; email: string | null; phone?: string | null },
) {
  const existing = await db.from("profiles").select("id").eq("id", profile.id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return;
  const inserted = await db.from("profiles").insert(profile);
  if (inserted.error) throw new Error(inserted.error.message);
  undo.push(async () => {
    await db.from("profiles").delete().eq("id", profile.id);
  });
}

async function insertRole(db: DbLike, undo: Undo[], userId: string, role: "admin" | "socio") {
  const inserted = await db.from("user_roles").insert({ user_id: userId, role });
  if (inserted.error) throw new Error(inserted.error.message);
  undo.push(async () => {
    await db.from("user_roles").delete().eq("user_id", userId).eq("role", role);
  });
}

/* ------------------------------------------------------------- alta gimnasio */

export const DEFAULT_PLANS = [
  { name: "Mensual", price: 18000, months: 1 },
  { name: "Trimestral", price: 48000, months: 3 },
  { name: "Semestral", price: 85000, months: 6 },
  { name: "Anual", price: 150000, months: 12 },
];

export async function provisionGym(
  admin: AdminLike,
  data: { email: string; password: string; full_name: string; gym_name?: string | undefined },
): Promise<{ gymId: string; userId: string }> {
  const userId = await createAuthUser(
    admin,
    {
      email: data.email,
      password: data.password,
      email_confirm: false,
      user_metadata: { full_name: data.full_name },
    },
    "gym",
  );

  const undo: Undo[] = [
    async () => {
      await admin.auth.admin.deleteUser(userId);
    },
  ];

  try {
    const gym = await admin
      .from("gyms")
      .insert({ name: data.gym_name?.trim() || "Mi Gimnasio", email: data.email })
      .select("id")
      .single();
    if (gym.error) throw new Error(gym.error.message);
    const gymId = gym.data?.id;
    if (!gymId) throw new Error("No se pudo crear el gimnasio.");
    undo.push(async () => {
      await admin.from("gyms").delete().eq("id", gymId);
    });

    await ensureProfile(admin, undo, {
      id: userId,
      full_name: data.full_name,
      email: data.email,
    });

    await insertRole(admin, undo, userId, "admin");

    const gymAdmin = await admin.from("gym_admins").insert({ gym_id: gymId, user_id: userId });
    if (gymAdmin.error) throw new Error(gymAdmin.error.message);
    undo.push(async () => {
      await admin.from("gym_admins").delete().eq("user_id", userId).eq("gym_id", gymId);
    });

    const settings = await admin.from("gym_notification_settings").insert({ gym_id: gymId });
    if (settings.error) throw new Error(settings.error.message);
    undo.push(async () => {
      await admin.from("gym_notification_settings").delete().eq("gym_id", gymId);
    });

    const plans = await admin
      .from("plans")
      .insert(DEFAULT_PLANS.map((p) => ({ ...p, gym_id: gymId })));
    if (plans.error) throw new Error(plans.error.message);
    undo.push(async () => {
      await admin.from("plans").delete().eq("gym_id", gymId);
    });

    return { gymId, userId };
  } catch (err) {
    await undoAll(undo);
    throw friendlyError(err);
  }
}

/* ----------------------------------------------------------------- alta socio */

export async function provisionMember(params: {
  /** Cliente del administrador logueado (respeta las reglas de la base). */
  db: DbLike;
  /** Cliente con permisos de servicio; sólo hace falta si se crea la cuenta. */
  admin?: AdminLike | undefined;
  createAccount: boolean;
  password?: string | undefined;
  fields: Record<string, unknown> & {
    first_name: string;
    last_name: string;
    email?: string | null | undefined;
    phone?: string | null | undefined;
  };
}): Promise<{ id: string; userId: string | null }> {
  const { db, admin, createAccount, password, fields } = params;
  const undo: Undo[] = [];
  let userId: string | null = null;

  try {
    if (createAccount) {
      if (!fields.email) throw new Error("Para crear la cuenta del socio hace falta un email.");
      if (!password) throw new Error("Definí una contraseña para la cuenta del socio.");
      if (password.length < PASSWORD_MIN_LENGTH) throw new Error(PASSWORD_MIN_MESSAGE);
      if (!admin) throw new Error("No se pudo crear la cuenta del socio.");

      userId = await createAuthUser(
        admin,
        {
          email: fields.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: `${fields.first_name} ${fields.last_name}` },
        },
        "member",
      );
      const newUserId = userId;
      undo.push(async () => {
        await admin.auth.admin.deleteUser(newUserId);
      });

      await ensureProfile(admin, undo, {
        id: newUserId,
        full_name: `${fields.first_name} ${fields.last_name}`,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
      });

      await insertRole(admin, undo, newUserId, "socio");
    }

    const member = await db
      .from("members")
      .insert({ ...fields, user_id: userId })
      .select("id")
      .single();
    if (member.error) throw new Error(member.error.message);
    const id = member.data?.id;
    if (!id) throw new Error("No se pudo guardar la ficha del socio.");
    return { id, userId };
  } catch (err) {
    await undoAll(undo);
    throw friendlyError(err);
  }
}
