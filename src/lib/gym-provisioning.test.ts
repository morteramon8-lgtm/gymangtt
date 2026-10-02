import { describe, expect, it } from "vitest";

import { provisionGym, provisionMember, type AdminLike, type DbLike } from "./gym-provisioning";

type Row = Record<string, unknown>;

/** Base de datos de mentira: guarda filas y permite forzar el fallo de un paso. */
function fakeDb(options: {
  failOn?: { table: string; message: string };
  existingRows?: Record<string, Row[]>;
} = {}) {
  const rows: Record<string, Row[]> = { ...(options.existingRows ?? {}) };
  const deletedUsers: string[] = [];
  const uid = () => Math.random().toString(36).slice(2);

  const table = (name: string) => {
    rows[name] ??= [];
    const store = rows[name]!;

    const insertResult = (values: unknown) => {
      if (options.failOn?.table === name) {
        return { data: null, error: { message: options.failOn.message } };
      }
      const list = Array.isArray(values) ? (values as Row[]) : [values as Row];
      const created = list.map((v) => ({ id: v['id'] ?? `${name}-${uid()}`, ...v }));
      store.push(...created);
      return { data: created[0] ?? null, error: null };
    };

    return {
      insert: (values: unknown) => {
        const res = insertResult(values);
        return {
          then: (cb: (r: unknown) => unknown) => Promise.resolve(cb({ error: res.error })),
          select: () => ({
            eq: () => ({}) as never,
            maybeSingle: async () => res,
            single: async () => res,
          }),
        } as never;
      },
      select: () => {
        const filters: Array<[string, unknown]> = [];
        const api = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return api;
          },
          maybeSingle: async () => ({
            data:
              (store.find((r) => filters.every(([c, v]) => r[c] === v)) as { id: string }) ?? null,
            error: null,
          }),
          single: async () => ({
            data:
              (store.find((r) => filters.every(([c, v]) => r[c] === v)) as { id: string }) ?? null,
            error: null,
          }),
        };
        return api as never;
      },
      delete: () => {
        const filters: Array<[string, unknown]> = [];
        const api = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            const removed = store.filter((r) => filters.every(([c, v]) => r[c] === v));
            for (const r of removed) store.splice(store.indexOf(r), 1);
            return Object.assign(api, { then: (cb: (r: unknown) => unknown) => Promise.resolve(cb({ error: null })) });
          },
        };
        return api as never;
      },
    };
  };

  const db = { from: table } as unknown as DbLike;
  const admin = {
    from: table,
    auth: {
      admin: {
        createUser: async (payload: Record<string, unknown>) => {
          const email = String(payload['email']);
          rows['auth_users'] ??= [];
          if (rows['auth_users'].some((u) => u['email'] === email)) {
            return { data: { user: null }, error: { message: "User already registered" } };
          }
          const user = { id: `user-${uid()}`, email };
          rows['auth_users'].push(user);
          return { data: { user }, error: null };
        },
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          rows['auth_users'] = (rows['auth_users'] ?? []).filter((u) => u['id'] !== id);
          return {};
        },
      },
    },
  } as unknown as AdminLike;

  return { db, admin, rows, deletedUsers };
}

const gymData = { email: "dueno@gym.com", password: "Sup3rClave!", full_name: "Ana Perez" };

const memberFields = { first_name: "Juan", last_name: "Lopez", email: "juan@gym.com" };

describe("alta de gimnasio", () => {
  it("crea gimnasio, perfil, rol, admin, configuración y planes", async () => {
    const { db: _db, admin, rows } = fakeDb();
    const res = await provisionGym(admin, gymData);
    expect(res.gymId).toBeTruthy();
    expect(rows['gyms']).toHaveLength(1);
    expect(rows['profiles']).toHaveLength(1);
    expect(rows['user_roles']).toHaveLength(1);
    expect(rows['gym_admins']).toHaveLength(1);
    expect(rows['gym_notification_settings']).toHaveLength(1);
    expect(rows['plans']).toHaveLength(4);
  });

  for (const table of ["profiles", "user_roles", "gym_notification_settings", "plans"]) {
    it(`deshace todo si falla ${table}`, async () => {
      const { admin, rows, deletedUsers } = fakeDb({
        failOn: { table, message: "boom" },
      });
      await expect(provisionGym(admin, gymData)).rejects.toThrow();
      expect(deletedUsers).toHaveLength(1);
      expect(rows['auth_users'] ?? []).toHaveLength(0);
      expect(rows['gyms'] ?? []).toHaveLength(0);
      expect(rows['profiles'] ?? []).toHaveLength(0);
      expect(rows['user_roles'] ?? []).toHaveLength(0);
      expect(rows['gym_admins'] ?? []).toHaveLength(0);
      expect(rows['gym_notification_settings'] ?? []).toHaveLength(0);
      expect(rows['plans'] ?? []).toHaveLength(0);
    });
  }

  it("avisa cuando el email ya existe y no crea nada", async () => {
    const { admin, rows } = fakeDb({
      existingRows: { auth_users: [{ id: "user-0", email: gymData.email }] },
    });
    await expect(provisionGym(admin, gymData)).rejects.toThrow(/Ya existe una cuenta/);
    expect(rows['gyms'] ?? []).toHaveLength(0);
  });

  it("no duplica el gimnasio al repetir la operación con el mismo email", async () => {
    const shared = fakeDb();
    await provisionGym(shared.admin, gymData);
    await expect(provisionGym(shared.admin, gymData)).rejects.toThrow(/Ya existe una cuenta/);
    expect(shared.rows['gyms']).toHaveLength(1);
  });

  it("no borra datos de altas anteriores cuando una nueva falla", async () => {
    const ok = fakeDb();
    await provisionGym(ok.admin, gymData);
    const failing = fakeDb({
      failOn: { table: "plans", message: "boom" },
      existingRows: ok.rows,
    });
    await expect(
      provisionGym(failing.admin, { ...gymData, email: "otro@gym.com" }),
    ).rejects.toThrow();
    expect(ok.rows['gyms']).toHaveLength(1);
    expect(ok.rows['plans']).toHaveLength(4);
  });
});

describe("alta de socio", () => {
  it("crea la ficha y la cuenta del socio", async () => {
    const { db, admin, rows } = fakeDb();
    const res = await provisionMember({
      db,
      admin,
      createAccount: true,
      password: "Sup3rClave!",
      fields: memberFields,
    });
    expect(res.id).toBeTruthy();
    expect(res.userId).toBeTruthy();
    expect(rows['members']).toHaveLength(1);
    expect(rows['user_roles']).toHaveLength(1);
  });

  it("crea la ficha sin cuenta cuando no se pide cuenta", async () => {
    const { db, rows } = fakeDb();
    const res = await provisionMember({ db, createAccount: false, fields: memberFields });
    expect(res.userId).toBeNull();
    expect(rows['auth_users'] ?? []).toHaveLength(0);
  });

  it("borra la cuenta recién creada si falla la ficha del socio", async () => {
    const { db, admin, rows, deletedUsers } = fakeDb({
      failOn: { table: "members", message: "members_email_unique" },
    });
    await expect(
      provisionMember({
        db,
        admin,
        createAccount: true,
        password: "Sup3rClave!",
        fields: memberFields,
      }),
    ).rejects.toThrow(/Ya hay otro socio cargado con ese email/);
    expect(deletedUsers).toHaveLength(1);
    expect(rows['auth_users'] ?? []).toHaveLength(0);
    expect(rows['profiles'] ?? []).toHaveLength(0);
    expect(rows['user_roles'] ?? []).toHaveLength(0);
  });

  it("avisa si el email de la cuenta ya está registrado", async () => {
    const { db, admin } = fakeDb({
      existingRows: { auth_users: [{ id: "user-0", email: memberFields.email }] },
    });
    await expect(
      provisionMember({
        db,
        admin,
        createAccount: true,
        password: "Sup3rClave!",
        fields: memberFields,
      }),
    ).rejects.toThrow(/Ya existe una cuenta/);
  });

  it("pide contraseña cuando se quiere crear la cuenta", async () => {
    const { db, admin } = fakeDb();
    await expect(
      provisionMember({ db, admin, createAccount: true, fields: memberFields }),
    ).rejects.toThrow(/contraseña/);
  });
});
