"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin } from "@/lib/auth/sessao";
import { desconectarRobo } from "@/lib/robo";

export async function desconectarWhatsApp() {
  await exigirAdmin();
  await desconectarRobo();
  revalidatePath("/admin/whatsapp");
}
