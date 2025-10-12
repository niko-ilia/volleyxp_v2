export default function Footer() {
  return (
    <footer className="border-t py-8 mt-16">
      <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>VolleyXP © {new Date().getFullYear()} — Find your game!</p>
        <div className="flex items-center gap-6">
          <a className="hover:underline" href="#">Client Agreement</a>
          <a className="hover:underline" href="#">Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}




