"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AuthUser, ShopSettings, Shift } from "@/lib/types";
import { Alert, Btn, Field, Input, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type UserRow = AuthUser & { is_active?: boolean; phone?: string };

export default function SettingsPage() {
  const { hasPermission, user } = useAuth();
  const [shop, setShop] = useState<ShopSettings>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openCash, setOpenCash] = useState("0");
  const [closeCash, setCloseCash] = useState("");
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setShop(await api<ShopSettings>("/shop"));
    const cur = await api<Shift | null>("/shifts/current").catch(() => null);
    setShift(cur);
    if (hasPermission("manage_users")) {
      setUsers(await api<UserRow[]>("/auth/users"));
      if (user?.role === "admin" || user?.role === "manager") {
        setShifts(await api<Shift[]>("/shifts").catch(() => []));
      }
    }
  }

  useEffect(() => {
    void load();
  }, [hasPermission, user?.role]);

  async function saveShop() {
    try {
      setShop(await api<ShopSettings>("/shop", { method: "PUT", body: JSON.stringify(shop) }));
      setMsg("Shop settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function createUser() {
    try {
      await api("/auth/users", { method: "POST", body: JSON.stringify(userForm) });
      setUserForm({ name: "", email: "", password: "", role: "cashier" });
      setUsers(await api<UserRow[]>("/auth/users"));
      setMsg("User created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function openShift() {
    await api("/shifts/open", { method: "POST", body: JSON.stringify({ opening_cash: Number(openCash) || 0 }) });
    await load();
    setMsg("Shift opened");
  }

  async function closeShift() {
    await api("/shifts/close", {
      method: "POST",
      body: JSON.stringify({ closing_cash: Number(closeCash) || 0 }),
    });
    await load();
    setMsg("Shift closed");
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Shop profile</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={shop.name || ""} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={shop.phone || ""} onChange={(e) => setShop({ ...shop, phone: e.target.value })} />
          </Field>
          <Field label="VAT / TIN">
            <Input value={shop.vat_tin || ""} onChange={(e) => setShop({ ...shop, vat_tin: e.target.value })} />
          </Field>
          <Field label="Default tax %">
            <Input
              value={String(shop.default_tax_percent ?? 0)}
              onChange={(e) => setShop({ ...shop, default_tax_percent: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input value={shop.address || ""} onChange={(e) => setShop({ ...shop, address: e.target.value })} className="sm:col-span-2" />
          </Field>
        </div>
        <Btn className="mt-4" onClick={() => void saveShop()}>
          Save shop
        </Btn>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Shift</h2>
        {shift ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Open since {formatDateTime(shift.opened_at)} — opening cash {shift.opening_cash ?? 0}
            </p>
            <Field label="Closing cash">
              <Input value={closeCash} onChange={(e) => setCloseCash(e.target.value)} className="max-w-xs" />
            </Field>
            <Btn onClick={() => void closeShift()}>Close shift</Btn>
          </div>
        ) : (
          <div className="mt-3">
            <Field label="Opening cash">
              <Input value={openCash} onChange={(e) => setOpenCash(e.target.value)} className="max-w-xs" />
            </Field>
            <Btn className="mt-2" onClick={() => void openShift()}>
              Open shift
            </Btn>
          </div>
        )}
      </section>

      {hasPermission("manage_users") ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Users</h2>
          <TableWrap className="mt-3">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>{u.role}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <UserCreateForm userForm={userForm} setUserForm={setUserForm} createUser={createUser} />
        </section>
      ) : null}

      {shifts.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Recent shifts</h2>
          <TableWrap className="mt-3">
            <thead>
              <tr>
                <Th>Opened</Th>
                <Th>Closed</Th>
                <Th>Opening</Th>
                <Th>Closing</Th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <Td>{formatDateTime(s.opened_at)}</Td>
                  <Td>{formatDateTime(s.closed_at)}</Td>
                  <Td className="font-mono">{s.opening_cash}</Td>
                  <Td className="font-mono">{s.closing_cash}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </section>
      ) : null}
    </div>
  );
}

function UserCreateForm({
  userForm,
  setUserForm,
  createUser,
}: {
  userForm: { name: string; email: string; password: string; role: string };
  setUserForm: (v: { name: string; email: string; password: string; role: string }) => void;
  createUser: () => void;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
      </Field>
      <Field label="Password">
        <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
      </Field>
      <Field label="Role">
        <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
          <option value="cashier">Cashier</option>
          <option value="stock">Stock</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <Btn onClick={() => void createUser()}>Create user</Btn>
    </div>
  );
}
