export default function Home() {
  return (
    <main>
      <h1>GitHub Proxy</h1>
      <p>Access GitHub repositories through our proxy.</p>
      <ul>
        <li><a href="/owner/repo">/owner/repo</a> - GitHub pages</li>
        <li><a href="/raw/owner/repo/main/file.txt">/raw/owner/repo/main/file.txt</a> - Raw files</li>
      </ul>
    </main>
  );
}
