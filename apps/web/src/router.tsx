import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Weather from './pages/Weather';
import { Layout } from './components/Layout';
import { RouteError } from './components/RouteError';
import { ProtectedRoute } from './features/auth/ProtectedRoute';

const RiskMap = lazy(() => import('./pages/RiskMap'));
const Login = lazy(() => import('./pages/Login'));
const SymptomChecker = lazy(() => import('./pages/SymptomChecker'));
const Report = lazy(() => import('./pages/Report'));
const Resources = lazy(() => import('./pages/Resources'));
const Moderation = lazy(() => import('./pages/Moderation'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />,
        errorElement: <RouteError />,
      },
      {
        path: 'weather',
        element: <Weather />,
        errorElement: <RouteError />,
      },
      {
        path: 'risk',
        element: (
          <Suspense fallback={null}>
            <RiskMap />
          </Suspense>
        ),
        errorElement: <RouteError />,
      },
      {
        path: 'login',
        element: (
          <Suspense fallback={null}>
            <Login />
          </Suspense>
        ),
        errorElement: <RouteError />,
      },
      {
        path: 'symptoms',
        element: (
          <Suspense fallback={null}>
            <SymptomChecker />
          </Suspense>
        ),
        errorElement: <RouteError />,
      },
      {
        path: 'report',
        element: (
          <Suspense fallback={null}>
            <Report />
          </Suspense>
        ),
        errorElement: <RouteError />,
      },
      {
        path: 'resources',
        element: (
          <Suspense fallback={null}>
            <Resources />
          </Suspense>
        ),
        errorElement: <RouteError />,
      },
      {
        path: 'moderation',
        element: (
          <ProtectedRoute role="moderator">
            <Suspense fallback={null}>
              <Moderation />
            </Suspense>
          </ProtectedRoute>
        ),
        errorElement: <RouteError />,
      },
      {
        path: '*',
        element: <NotFound />,
        errorElement: <RouteError />,
      },
    ],
  },
]);
