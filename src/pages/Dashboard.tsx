import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  const { tier, subscriptionStatus, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-svh p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Waytrace Dashboard</h1>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your current plan and subscription status.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p>
              <span className="font-medium">Tier:</span> {tier}
            </p>
            <p>
              <span className="font-medium">Subscription:</span> {subscriptionStatus}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
