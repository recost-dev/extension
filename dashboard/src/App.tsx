import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './layout/Layout';
import { ThemeProvider } from './theme-context';
import { galaxySunsetTheme } from './themes';
import Projects from './pages/Projects';
import Dashboard from './pages/Dashboard';
import Endpoints from './pages/Endpoints';
import Suggestions from './pages/Suggestions';
import Graph from './pages/Graph';
import AiChat from './pages/AiChat';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: import.meta.env.VITE_LOCAL_MODE
      ? <Navigate to="/projects/local" replace />
      : <ThemeProvider theme={galaxySunsetTheme}><Projects /></ThemeProvider>,
  },
  {
    path: '/projects/:projectId',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'endpoints', Component: Endpoints },
      { path: 'suggestions', Component: Suggestions },
      { path: 'graph', Component: Graph },
      { path: 'chat', Component: AiChat },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
