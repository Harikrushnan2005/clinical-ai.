import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen p-6">
        <Outlet />
      </main>
    </div>
  );
};
