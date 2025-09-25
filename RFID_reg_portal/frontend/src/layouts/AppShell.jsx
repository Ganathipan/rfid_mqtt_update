import { Link, NavLink, Outlet } from "react-router-dom";
import Button from "../ui/Button.jsx";
export default function AppShell(){
  return (
  <div className="min-h-screen bg-brand-ink text-white">
  <header className="sticky top-0 z-20 backdrop-blur bg-[linear-gradient(90deg,#0056a2_0%,#00b4eb_40%,transparent_100%)]/50 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <Link to="/" className="font-bold text-white">RFID Portal</Link>
          <nav className="ml-auto flex items-center gap-4 text-white/80">
            <NavLink to="/admin" className={({isActive})=>isActive?"text-white":"hover:text-white"}>Admin</NavLink>
            <NavLink to="/admin/game-lite" className={({isActive})=>isActive?"text-white":"hover:text-white"}>Game</NavLink>
            <NavLink to="/admin/exitout" className={({isActive})=>isActive?"text-white":"hover:text-white"}>ExitOut</NavLink>
            <NavLink to="/kiosk" className={({isActive})=>isActive?"text-white":"hover:text-white"}>Kiosks</NavLink>
            <a href="/" className="ml-4">
              <Button size="sm" variant="accent">Portal</Button>
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
