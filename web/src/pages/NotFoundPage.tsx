import { Link } from 'react-router';
import { AuthLayout } from './AuthLayout.tsx';

export function NotFoundPage() {
  return (
    <AuthLayout
      title="Página no encontrada"
      subtitle="La dirección que has abierto no existe."
      footer={<Link to="/">Volver al inicio</Link>}
    >
      {null}
    </AuthLayout>
  );
}
