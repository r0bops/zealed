/** Product name with only the leading Z in Zcash gold. */
export function ZealedName({ lowercase = false }: { lowercase?: boolean }) {
  const word = lowercase ? "zealed" : "Zealed";
  return (
    <>
      <span className="z-accent">{word.slice(0, 1)}</span>
      {word.slice(1)}
    </>
  );
}
