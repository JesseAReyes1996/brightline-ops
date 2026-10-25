import { NextResponse, type NextRequest } from "next/server";
import { isSitePasswordValid } from "./src/lib/siteAuth";

// Site-wide password gate for the hosted demo: HTTP Basic Auth, any username,
// checked against SITE_PASSWORD. There is deliberately no `matcher`, so this
// runs on every request: pages, API routes, and static files. Browsers resend
// the credentials on every same-origin request after the first prompt,
// including the app's fetch calls. With SITE_PASSWORD unset there is no gate.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password || isSitePasswordValid(request.headers.get("authorization"), password)) {
    return NextResponse.next();
  }
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Brightline Ops", charset="UTF-8"' },
  });
}
