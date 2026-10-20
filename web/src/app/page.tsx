"use client";

import { useEffect } from "react";

export default function Inicio() {
  useEffect(() => {
    window.location.replace("/tarefas");
  }, []);
  return null;
}
