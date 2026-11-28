import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import Inbox from "./pages/Inbox";
import Contacts from "./pages/Contacts";
import Users from "./pages/Users";
import ApiDocs from "./pages/ApiDocs";
import PublicLayout from "./public/PublicLayout";
import Home from "./public/pages/Home";
import { About, Cancellation, Privacy, Refund, Terms } from "./public/pages/LegalPages";
import Contact from "./public/pages/Contact";
import Faq from "./public/pages/Faq";
import NotFound from "./public/pages/NotFound";

function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* Dashboard existing tetap berjalan; hanya dipindah ke /dashboard agar / bisa dipakai publik. */}
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Inbox />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/users" element={user?.role === "admin" ? <Users /> : <Navigate to="/dashboard" replace />} />
        <Route path="/api-docs" element={<ApiDocs />} />
      </Route>

      {/* Situs publik: dapat diakses tanpa login, termasuk oleh tim verifikasi payment gateway. */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Home />} />
        <Route path="/tentang-kami" element={<About />} />
        <Route path="/kebijakan-privasi" element={<Privacy />} />
        <Route path="/syarat-ketentuan" element={<Terms />} />
        <Route path="/kebijakan-refund" element={<Refund />} />
        <Route path="/kebijakan-pembatalan" element={<Cancellation />} />
        <Route path="/hubungi-kami" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
