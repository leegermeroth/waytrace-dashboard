import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function CheckEmail() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            Your subscription is confirmed. We sent you a link to set your password — it should
            arrive within a minute or two.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Can't find it? Check your spam folder. The email comes from{' '}
            <span className="font-medium text-foreground">hello@waytrace.co</span>.
          </p>
          <p>
            Already set your password?{' '}
            <Link to="/login" className="underline text-foreground">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
