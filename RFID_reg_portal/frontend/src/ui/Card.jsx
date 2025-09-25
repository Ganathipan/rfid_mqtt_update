import clsx from "clsx";
export function Card({className, ...props}){
  return <div className={clsx("rounded-2xl bg-white/5 backdrop-blur border border-white/10 shadow-xl", className)} {...props} />
}
export function CardHeader({className, ...props}){
  return <div className={clsx("px-5 py-3 border-b border-white/10 text-white/90 font-semibold", className)} {...props} />
}
export function CardBody({className, ...props}){
  return <div className={clsx("p-5 text-white/90", className)} {...props} />
}
