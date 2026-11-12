import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { ToastProvider } from './ui/kit.jsx';
import { BASE, getSession } from './api.js';
import Landing from './site/Landing.jsx';
import { Login, Signup } from './site/Auth.jsx';
import AdminLayout from './admin/Layout.jsx';
import Overview from './admin/Overview.jsx';
import Members from './admin/Members.jsx';
import MemberDetail from './admin/MemberDetail.jsx';
import Access from './admin/Access.jsx';
import Finance from './admin/Finance.jsx';
import CRM from './admin/CRM.jsx';
import Training from './admin/Training.jsx';
import Diets from './admin/Diets.jsx';
import Plans from './admin/Plans.jsx';
import Reports from './admin/Reports.jsx';
import Settings from './admin/Settings.jsx';
import MemberApp from './member/MemberApp.jsx';
import Platform from './platform/Platform.jsx';

function RequireStaff({ children }) {
  const s = getSession();
  if (!s) return <Navigate to="/entrar" replace />;
  if (s.user.role === 'aluno') return <Navigate to="/app" replace />;
  return children;
}
function RequireMember({ children }) {
  const s = getSession();
  if (!s) return <Navigate to="/entrar?app=1" replace />;
  if (s.user.role !== 'aluno') return <Navigate to="/painel" replace />;
  return children;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter basename={BASE || undefined}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/cadastro" element={<Signup />} />
          <Route
            path="/painel"
            element={
              <RequireStaff>
                <AdminLayout />
              </RequireStaff>
            }
          >
            <Route index element={<Overview />} />
            <Route path="catraca" element={<Access />} />
            <Route path="alunos" element={<Members />} />
            <Route path="alunos/:id" element={<MemberDetail />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="crm" element={<CRM />} />
            <Route path="treinos" element={<Training />} />
            <Route path="dietas" element={<Diets />} />
            <Route path="planos" element={<Plans />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="configuracoes" element={<Settings />} />
          </Route>
          <Route
            path="/app/*"
            element={
              <RequireMember>
                <MemberApp />
              </RequireMember>
            }
          />
          <Route path="/plataforma" element={<Platform />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
