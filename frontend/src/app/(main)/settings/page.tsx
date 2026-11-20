"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, mediaUrl, uploadImage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AuthUser, PermissionKey, ShopSettings, Shift } from "@/lib/types";
import { Alert, Btn, Field, Input, Modal, PageHeader, Select, TableWrap, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type UserRow = AuthUser & {
  is_active?: boolean;
  phone?: string;
  permissions?: PermissionKey[] | Record<string, boolean>;
};

const ALL_PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: "discount", label: "Discount" },
  { key: "void", label: "Void sales" },
  { key: "see_cost", label: "See cost / profit" },
  { key: "approve_return", label: "Approve returns" },
  { key: "wholesale_price", label: "Wholesale price" },
  { key: "backdate_sale", label: "Backdate sale" },
  { key: "manage_users", label: "Manage users" },
  { key: "walkin_exchange", label: "Walk-in exchange" },
];

const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  admin: ALL_PERMISSIONS.map((p) => p.key),
  manager: ["discount", "void", "see_cost", "approve_return", "wholesale_price", "backdate_sale", "walkin_exchange"],
  cashier: ["discount"],
  stock: [],
};

function overridesFromUser(u: UserRow): Record<string, boolean> {
  const raw = u.permissions;
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    return { ...(raw as Record<string, boolean>) };
  }
  return {};
}

export default function SettingsPage() {
  const { hasPermission, user } = useAuth();
  const [shop, setShop] = useState<ShopSettings>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openCash, setOpenCash] = useState("0");
  const [closeCash, setCloseCash] = useState("");
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "cashier",
    is_active: true,
    password: "",
    permissions: {} as Record<string, boolean>,
  });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onLogoFile(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError("");
    try {
      const { url } = await uploadImage(file);
      setShop((s) => ({ ...s, logo_url: url }));
      setMsg("Logo uploaded — click Save shop to keep it");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function createUser() {
    try {
      await api("/auth/users", { method: "POST", body: JSON.stringify(userForm) });
      setUserForm({ name: "", email: "", password: "", role: "cashier" });
      setUsers(await api<UserRow[]>("/auth/users"));
      setMsg("User created");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditForm({
      name: u.name,
      phone: u.phone || "",
      role: u.role,
      is_active: u.is_active !== false,
      password: "",
      permissions: overridesFromUser(u),
    });
  }

  function togglePerm(key: PermissionKey, enabled: boolean) {
    const defaults = ROLE_DEFAULTS[editForm.role] || [];
    const next = { ...editForm.permissions };
    if (enabled === defaults.includes(key)) {
      delete next[key];
    } else {
      next[key] = enabled;
    }
    setEditForm({ ...editForm, permissions: next });
  }

  function effectivePerm(key: PermissionKey): boolean {
    if (key in editForm.permissions) return !!editForm.permissions[key];
    return (ROLE_DEFAULTS[editForm.role] || []).includes(key);
  }

  async function saveUser() {
    if (!editUser) return;
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        phone: editForm.phone || null,
        role: editForm.role,
        is_active: editForm.is_active,
        permissions: editForm.permissions,
      };
      if (editForm.password.trim()) body.password = editForm.password.trim();
      await api(`/auth/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditUser(null);
      setUsers(await api<UserRow[]>("/auth/users"));
      setMsg("User updated");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Invoice documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              Design printable invoices with a Google Docs–style editor and set them as the print default.
            </p>
          </div>
          <Link href="/documents">
            <Btn variant="secondary">Open document designer</Btn>
          </Link>
        </div>
      </section>

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
          <Field label="Address" className="sm:col-span-2">
            <Input value={shop.address || ""} onChange={(e) => setShop({ ...shop, address: e.target.value })} />
          </Field>
          <Field label="Logo URL" className="sm:col-span-2">
            <Input
              value={shop.logo_url || ""}
              onChange={(e) => setShop({ ...shop, logo_url: e.target.value })}
              placeholder="/uploads/… or https://…"
            />
          </Field>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <span className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                {uploadingLogo ? "Uploading…" : "Upload logo"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => void onLogoFile(e.target.files?.[0] || null)}
              />
            </label>
            {shop.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(shop.logo_url)} alt="Shop logo" className="h-14 max-w-[160px] object-contain" />
            ) : null}
          </div>
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
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>{u.role}</Td>
                  <Td>{u.is_active === false ? "Inactive" : "Active"}</Td>
                  <Td>
                    <Btn variant="ghost" className="text-xs" onClick={() => openEdit(u)}>
                      Edit
                    </Btn>
                  </Td>
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
                <Th>Expected</Th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <Td>{formatDateTime(s.opened_at)}</Td>
                  <Td>{formatDateTime(s.closed_at)}</Td>
                  <Td className="font-mono">{s.opening_cash}</Td>
                  <Td className="font-mono">{s.closing_cash}</Td>
                  <Td className="font-mono">{s.expected_cash ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </section>
      ) : null}

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit ${editUser?.email || "user"}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value, permissions: {} })}
            >
              <option value="cashier">Cashier</option>
              <option value="stock">Stock</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={editForm.is_active ? "active" : "inactive"}
              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === "active" })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Reset password (optional)" className="sm:col-span-2">
            <Input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              placeholder="Leave blank to keep current"
            />
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Permission overrides</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={effectivePerm(p.key)}
                  onChange={(e) => togglePerm(p.key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Btn onClick={() => void saveUser()}>Save user</Btn>
          <Btn variant="secondary" onClick={() => setEditUser(null)}>
            Cancel
          </Btn>
        </div>
      </Modal>
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
        <Input
          type="password"
          value={userForm.password}
          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
        />
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
