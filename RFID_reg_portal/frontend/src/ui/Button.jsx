import clsx from "clsx";
export default function Button({variant="primary", size="md", className, ...props}){
  const base = "inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary/60 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm:"px-3 py-1.5 text-sm", md:"px-4 py-2", lg:"px-5 py-3 text-lg" };
  const variants = {
    primary: "bg-brand-primary text-brand-ink hover:brightness-110",
    dark: "bg-brand-dark text-white hover:brightness-110",
    outline: "border border-white/20 text-white hover:bg-white/5",
    accent: "bg-brand-accent text-white hover:brightness-110",
    ghost: "text-white hover:bg-white/10"
  };
  return <button className={clsx(base, sizes[size], variants[variant], className)} {...props} />;
}
