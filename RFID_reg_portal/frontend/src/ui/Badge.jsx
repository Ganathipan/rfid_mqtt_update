import clsx from "clsx";
export default function Badge({color="gray", className, ...props}){
  const colors = {
    gray: "bg-white/10 text-white",
    green: "bg-emerald-500/20 text-emerald-200",
    red: "bg-rose-500/20 text-rose-200",
    yellow: "bg-amber-500/20 text-amber-100",
    blue: "bg-sky-500/20 text-sky-200"
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", colors[color], className)} {...props} />
}
