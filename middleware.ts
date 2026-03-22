export const config = {
  // Only run middleware for ticket share pages.
  matcher: ['/share/ticket/:id*'],
};

export default function middleware(request: Request): Response {
  return new Response('MIDDLEWARE WORKING', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
