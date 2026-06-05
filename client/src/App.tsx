// ⚠️ 必须使用 HashRouter，禁止改为 BrowserRouter（部署平台挂载在子路径下，BrowserRouter 无法匹配）
import { HashRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/HomePage";
import { DashboardPage } from "@/pages/DashboardPage";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/home" element={<HomePage />} />
      </Routes>
      <Toaster position="top-center" />
    </HashRouter>
  );
}
