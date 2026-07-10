import { useEffect, useState, type FormEvent } from 'react'
import {
  listUsers,
  inviteUser,
  updateUser,
  deleteUser,
  getMe,
  type TeamUser,
  type Me,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function Users() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'contributor'>('contributor')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)

  // Per-row action state
  const [rowError, setRowError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    refresh()
    getMe()
      .then(setMe)
      .catch(() => {
        // Owner row is a nicety — don't block the page if /me fails.
      })
  }, [])

  function refresh() {
    setIsLoading(true)
    listUsers()
      .then(setUsers)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setIsLoading(false))
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)
    setIsInviting(true)
    try {
      const created = await inviteUser({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      })
      setInviteSuccess(`Invitation sent to ${created.email}.`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('contributor')
      refresh()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setIsInviting(false)
    }
  }

  async function handleRoleChange(user: TeamUser, role: 'admin' | 'contributor') {
    if (role === user.role) return
    setRowError(null)
    setBusyId(user.id)
    try {
      const updated = await updateUser(user.id, { role })
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleActive(user: TeamUser) {
    setRowError(null)
    setBusyId(user.id)
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active })
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(user: TeamUser) {
    if (!confirm(`Remove ${user.name || user.email}? They will lose access immediately.`)) return
    setRowError(null)
    setBusyId(user.id)
    try {
      await deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Failed to remove user')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite teammates and manage their access. Team plan allows up to 5 users, including you.
        </p>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Invite form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>
            They'll get an email with a link to set a password and join your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4">
            {inviteError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
            {inviteSuccess && (
              <Alert>
                <AlertDescription>{inviteSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite_email">Email</Label>
                <Input
                  id="invite_email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite_name">Name (optional)</Label>
                <Input
                  id="invite_name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole((v as 'admin' | 'contributor') ?? 'contributor')}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">Contributor — create &amp; edit links</SelectItem>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isInviting} className="w-fit">
              {isInviting ? 'Sending...' : 'Send invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* User list */}
      {rowError && (
        <Alert variant="destructive">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Owner row — read-only, pulled from /me since GET /users omits the owner. */}
          {me && (
            <TableRow>
              <TableCell className="font-medium">{me.name || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{me.email ?? '—'}</TableCell>
              <TableCell>
                <Badge>Owner</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="default">Active</Badge>
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">You</TableCell>
            </TableRow>
          )}

          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <Select
                  value={user.role}
                  onValueChange={(v) => handleRoleChange(user, (v as 'admin' | 'contributor') ?? user.role)}
                >
                  <SelectTrigger className="w-40" disabled={busyId === user.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={user.status === 'active' ? 'default' : 'secondary'} className="w-fit">
                    {user.status === 'active' ? 'Active' : 'Invited'}
                  </Badge>
                  {!user.is_active && (
                    <Badge variant="secondary" className="w-fit">
                      Disabled
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === user.id}
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.is_active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busyId === user.id}
                    onClick={() => handleRemove(user)}
                  >
                    Remove
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}

          {!isLoading && users.length === 0 && !me && (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                No teammates yet. Invite someone above to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!isLoading && users.length === 0 && me && (
        <p className="text-sm text-muted-foreground">
          No teammates yet. Invite someone above to get started.
        </p>
      )}
    </div>
  )
}
