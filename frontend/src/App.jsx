import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { ROLE_HOME, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Restaurants from './pages/Restaurants.jsx';
import RestaurantMenu from './pages/RestaurantMenu.jsx';
import NotFound from './pages/NotFound.jsx';
import Cart from './pages/customer/Cart.jsx';
import CustomerDashboard from './pages/customer/CustomerDashboard.jsx';
import CustomerOrderDetail from './pages/customer/CustomerOrderDetail.jsx';
import AIInsights from './pages/customer/AIInsights.jsx';
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx';
import MenuManagement from './pages/owner/MenuManagement.jsx';
import OrderManagement from './pages/owner/OrderManagement.jsx';
import OwnerOrderDetail from './pages/owner/OwnerOrderDetail.jsx';
import ReturnRequests from './pages/owner/ReturnRequests.jsx';
import DeliveryDashboard from './pages/delivery/DeliveryDashboard.jsx';
import DeliveryOrderDetail from './pages/delivery/DeliveryOrderDetail.jsx';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? ROLE_HOME[user.role] : '/restaurants'} replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/restaurants/:id" element={<RestaurantMenu />} />

          <Route element={<ProtectedRoute roles={['customer']} />}>
            <Route path="/cart" element={<Cart />} />
            <Route path="/orders" element={<CustomerDashboard />} />
            <Route path="/orders/:id" element={<CustomerOrderDetail />} />
            <Route path="/insights" element={<AIInsights />} />
          </Route>

          <Route element={<ProtectedRoute roles={['restaurant_owner']} />}>
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/owner/menu" element={<MenuManagement />} />
            <Route path="/owner/orders" element={<OrderManagement />} />
            <Route path="/owner/orders/:id" element={<OwnerOrderDetail />} />
            <Route path="/owner/returns" element={<ReturnRequests />} />
          </Route>

          <Route element={<ProtectedRoute roles={['delivery_partner']} />}>
            <Route path="/delivery" element={<DeliveryDashboard scope="active" />} />
            <Route path="/delivery/history" element={<DeliveryDashboard scope="history" />} />
            <Route path="/delivery/orders/:id" element={<DeliveryOrderDetail />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container muted small">CampusBite · Capstone project · Payments are simulated</div>
      </footer>
    </>
  );
}
