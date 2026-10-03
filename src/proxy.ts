import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!process.env.VERCEL) return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = {
  matcher: ["/tool/:path*", "/api/tasks/:path*", "/api/activity/:path*", "/api/photos/:path*", "/api/ebay/:path*", "/api/system/:path*", "/api/integrations/:path*"],
};
