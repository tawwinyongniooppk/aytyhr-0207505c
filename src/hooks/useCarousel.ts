import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CarouselPosition = "top" | "middle" | "bottom";
export type CarouselAnimationStyle = "continuous" | "fade" | "slide-snap" | "pop";

export interface CarouselSettings {
  id: boolean;
  position: CarouselPosition;
  animation_style: CarouselAnimationStyle;
  animation_speed_seconds: number;
  enabled: boolean;
  updated_at: string;
}

export interface CarouselSlide {
  id: string;
  image_url: string;
  sort_order: number;
  link_enabled: boolean;
  link_url: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const SETTINGS_KEY = ["carousel", "settings"];
const SLIDES_KEY = ["carousel", "slides"];

export function useCarouselSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<CarouselSettings | null> => {
      const { data, error } = await supabase
        .from("carousel_settings" as any)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: Infinity,
  });
}

export function useCarouselSlides() {
  return useQuery({
    queryKey: SLIDES_KEY,
    queryFn: async (): Promise<CarouselSlide[]> => {
      const { data, error } = await supabase
        .from("carousel_slides" as any)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any) ?? [];
    },
    staleTime: Infinity,
  });
}

export function useUpdateCarouselSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<CarouselSettings, "id" | "updated_at">>) => {
      const { error } = await supabase
        .from("carousel_settings" as any)
        .update({ ...patch, updated_at: new Date().toISOString() } as any)
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useUpsertSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slide: Partial<CarouselSlide> & { image_url: string }) => {
      const payload: any = { ...slide, updated_at: new Date().toISOString() };
      if (slide.id) {
        const { error } = await supabase.from("carousel_slides" as any).update(payload).eq("id", slide.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("carousel_slides" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SLIDES_KEY }),
  });
}

export function useDeleteSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("carousel_slides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SLIDES_KEY }),
  });
}

export async function uploadSlideImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `carousel/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}
