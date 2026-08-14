import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Weather from './pages/Weather';
import { Layout } from './components/Layout';
import { RouteError } from './components/RouteError';

const RiskMap = lazy(() => import('./pages/RiskMap'));

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
        path: '*',
        element: <NotFound />,
        errorElement: <RouteError />,
      },
    ],
  },
]);
