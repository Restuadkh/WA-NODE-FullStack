import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import Inbox from "./pages/Inbox";
import Users from "./pages/Users";
import ApiDocs from "./pages/ApiDocs";

function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Inbox />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/users" element={user?.role === "admin" ? <Users /> : <Navigate to="/" replace />} />
        <Route path="/api-docs" element={<ApiDocs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
