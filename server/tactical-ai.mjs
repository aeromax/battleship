// Only public shot results enter this function; hidden placements cannot influence it.
export function chooseTarget({ shots = [], hits = [], sunk = [], difficulty = 'low' }, random = Math.random) {
  const coordinates = Array.from({ length: 81 }, (_, i) => `${String.fromCharCode(65 + i % 9)}${1 + Math.floor(i / 9)}`);
  const fired = new Set(shots);
  const available = coordinates.filter(coord => !fired.has(coord));
  const pick = list => list.length ? list[Math.floor(random() * list.length)] : null;
  if (difficulty === 'low' || !available.length) return pick(available);
  const unresolved = hits.filter(coord => !sunk.includes(coord));
  const neighbors = coord => {
    const x = coord.charCodeAt(0), y = Number(coord[1]);
    return [`${String.fromCharCode(x - 1)}${y}`, `${String.fromCharCode(x + 1)}${y}`, `${coord[0]}${y - 1}`, `${coord[0]}${y + 1}`];
  };
  const candidates = new Set(unresolved.flatMap(neighbors));
  const adjacent = available.filter(coord => candidates.has(coord));
  if (difficulty === 'hard' && adjacent.length) {
    // Continue a line of confirmed hits before exploring perpendicular neighbors.
    const aligned = adjacent.filter(coord => neighbors(coord).some(hit => {
      if (!unresolved.includes(hit)) return false;
      const beyond = `${String.fromCharCode(2 * hit.charCodeAt(0) - coord.charCodeAt(0))}${2 * Number(hit[1]) - Number(coord[1])}`;
      return unresolved.includes(beyond);
    }));
    if (aligned.length) return pick(aligned);
  }
  if (adjacent.length) return pick(adjacent);
  if (difficulty === 'hard') {
    const checkerboard = available.filter(coord => (coord.charCodeAt(0) - 65 + Number(coord[1]) - 1) % 2 === 0);
    if (checkerboard.length) return pick(checkerboard);
  }
  return pick(available);
}
