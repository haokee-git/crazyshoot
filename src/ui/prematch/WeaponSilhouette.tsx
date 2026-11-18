import type { WeaponId } from '../../content/weapons/catalog';

export function WeaponSilhouette({ weaponId, large = false }: { weaponId: WeaponId; large?: boolean }) {
  return (
    <img
      class={`weapon-silhouette${large ? ' large' : ''}`}
      src={`/ui/weapons/${weaponId}.png`}
      alt={weaponId}
      loading="lazy"
      draggable={false}
    />
  );
}
