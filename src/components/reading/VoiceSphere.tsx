// ponytail: esfera hecha con radial-gradients — cero peso, cero dependencias y
// escalable a cualquier tamaño (se reusa como avatar en los paneles). Si más
// adelante hay un video/canvas animado, reemplazar solo este componente.
export function VoiceSphere({ className = "size-64 md:size-80" }: { className?: string }) {
  return <div aria-hidden="true" className={`sphere shrink-0 rounded-full ${className}`} />;
}
