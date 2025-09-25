export default function Loader({size=24, className=""}){
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg className={"animate-spin text-white/80 "+className} style={{width:s, height:s}} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path d="M22 12c0-5.523-4.477-10-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
