import { lazy } from "react";
import { Navigate } from "react-router-dom"; 
// import { ProtectedRoute } from './../middleware/ProtectedRoute.js'
// import * as constant from "../constansts/permission.js";

const FullLayout = lazy(() => import("../components/layouts/FullLayout.js"));

/***** Pages ****/
const Login = lazy(()=>import("../components/auth/Login.js"))
const Register = lazy(()=>import("../components/auth/Register.js"))
const Dashboard = lazy(() => import("../components/Dashboard.js"));
const Sales = lazy(() => import("../components/Sales.js"));
const POSv2 = lazy(() => import("../components/pos/POSv2.js"));
const Report = lazy(() => import("../components/order/Report.js"));
const Payment = lazy(() => import("../components/pos/Payment.js"));
const Products = lazy(() => import("../components/products/Products.js"));
const CreateProduct = lazy(() => import("../components/products/CreateProduct.js"));
const Configuration = lazy(() => import("../components/config/Configuration.js"));
const CategoryAndTax = lazy(() => import("../components/config/CategoryAndTax.js"));
const Notes = lazy(() => import("../components/config/Notes.js"));
const User = lazy(() => import("../components/config/User.js"));
const Inventory = lazy(() => import("../components/inventory/Inventory.js"));
/*****Routes******/
const ThemeRoutes = [
  {
    path: "/",
    element: <FullLayout />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" /> },
      { path: "/login", exact: true, element:<Login />},
      { path: "/register", exact: true, element: <Register /> },
      { path: "/dashboard", 
        exact: true, 
        element: <Dashboard key={11}/>
      },
      {
        path: "/sales",
        element: <Sales key={0}/>,
      },
      {
        path: "/reports",
        element: <Report key={110}/>,
      },
      {
        path: "/pos/:type?",
        element: <POSv2 key={1}/>,
      },
      {
        path: "/products",
        element: <Products key={2}/>,
      },
      {
        path: "/product/create",
        element: <CreateProduct  key={3}/>,
      }, 
      {
        path: "/configuration",
        element: <Configuration key={4}/>,
      },
      {
        path: "/config/:type",
        element: <CategoryAndTax key={5}/>,
      },
      {
        path: "/inventory",
        element: <Inventory key={6}/>,
      },
      {
        path: "/payment/:active",
        element: <Payment key={7}/>,
      },
      {
        path: "/notes",
        element: <Notes key={8}/>,
      },
      {
        path: "/users",
        element: <User key={9}/>,
      },

    ],
  },
  
];

export default ThemeRoutes;
