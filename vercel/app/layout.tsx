export const metadata = {
  title: 'GitHub Proxy',
  description: 'Accelerate GitHub access via Vercel and Cloudflare',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
