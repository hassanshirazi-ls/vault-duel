// The wax seal (D-247) as the loading mark; the same artwork as the app icon (public/icon.svg).
export function Seal() {
  return <img className="seal-mark" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={96} height={96} draggable={false} />;
}
