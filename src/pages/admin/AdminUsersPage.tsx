import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminUsers } from '../../api/client';
import type { AdminUser } from '../../types';

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminUsers()
      .then((data) => setUsers(data.users))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Contas</h1>
        <p className="muted">Todos os clientes e quantos equipamentos cada um possui.</p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-card card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>E-mail</th>
              <th>Equipamentos</th>
              <th>Ativos</th>
              <th>Pendentes</th>
              <th>Cadastro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.devices_total}</td>
                <td>{user.devices_active}</td>
                <td>{user.devices_pending}</td>
                <td>{new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
                <td>
                  <Link to={`/admin/contas/${user.id}`}>Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 ? <p className="muted table-empty">Nenhuma conta.</p> : null}
      </div>
    </div>
  );
}
