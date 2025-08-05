import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface WorkspaceType {
  id: string;
  name: string;
  price: number;
  price_unit: string;
}

interface DurationDiscount {
  id: string;
  workspace_type_id: string;
  duration: string;
  discount_percentage: number;
  fixed_price: number | null;
  is_active: boolean;
}

interface DurationOption {
  value: string;
  label: string;
  multiplier: number;
  originalPrice: number;
  discountedPrice: number;
  discount: number;
  hasDiscount: boolean;
}

export const usePricing = () => {
  const [workspaceTypes, setWorkspaceTypes] = useState<WorkspaceType[]>([]);
  const [durationDiscounts, setDurationDiscounts] = useState<DurationDiscount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch workspace types and duration discounts in parallel
      const [workspaceResult, discountResult] = await Promise.all([
        supabase
          .from('workspace_types')
          .select('id, name, price, price_unit')
          .eq('is_active', true)
          .order('price', { ascending: true }),
        supabase
          .from('duration_discounts')
          .select('*')
          .eq('is_active', true)
      ]);

      if (workspaceResult.error) throw workspaceResult.error;
      if (discountResult.error) throw discountResult.error;

      setWorkspaceTypes(workspaceResult.data || []);
      setDurationDiscounts(discountResult.data || []);
    } catch (error) {
      console.error('Error fetching pricing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDurationOptions = (workspaceTypeName: string): DurationOption[] => {
    const workspace = workspaceTypes.find(w => w.name === workspaceTypeName);
    if (!workspace) return [];

    const baseDurations = [
      { value: '1 hour', label: '1 Hour', multiplier: 1 },
      { value: '2 hours', label: '2 Hours', multiplier: 2 },
      { value: '3 hours', label: '3 Hours', multiplier: 3 },
      { value: '4 hours', label: '4 Hours', multiplier: 4 },
      { value: '5 hours', label: '5 Hours', multiplier: 5 },
      { value: '6 hours', label: '6 Hours', multiplier: 6 }
    ];

    return baseDurations.map(duration => {
      const originalPrice = workspace.price * duration.multiplier;
      const discount = durationDiscounts.find(
        d => d.workspace_type_id === workspace.id && d.duration === duration.value
      );

      let discountedPrice = originalPrice;
      let discountAmount = 0;
      let hasDiscount = false;

      if (discount) {
        if (discount.fixed_price !== null && discount.fixed_price > 0) {
          // Use fixed price if set
          discountedPrice = discount.fixed_price;
          discountAmount = originalPrice - discount.fixed_price;
          hasDiscount = discountAmount > 0;
        } else if (discount.discount_percentage > 0) {
          // Apply percentage discount
          discountAmount = (originalPrice * discount.discount_percentage) / 100;
          discountedPrice = originalPrice - discountAmount;
          hasDiscount = true;
        }
      }

      return {
        value: duration.value,
        label: duration.label,
        multiplier: duration.multiplier,
        originalPrice,
        discountedPrice,
        discount: discountAmount,
        hasDiscount
      };
    });
  };

  const calculatePrice = (workspaceTypeName: string, duration: string): number => {
    const workspace = workspaceTypes.find(w => w.name === workspaceTypeName);
    if (!workspace) return 0;

    const durationOption = getDurationOptions(workspaceTypeName).find(d => d.value === duration);
    return durationOption ? durationOption.discountedPrice : 0;
  };

  const getPriceBreakdown = (workspaceTypeName: string, duration: string) => {
    const workspace = workspaceTypes.find(w => w.name === workspaceTypeName);
    if (!workspace) return null;

    const durationOption = getDurationOptions(workspaceTypeName).find(d => d.value === duration);
    if (!durationOption) return null;

    return {
      originalPrice: durationOption.originalPrice,
      discountedPrice: durationOption.discountedPrice,
      discount: durationOption.discount,
      hasDiscount: durationOption.hasDiscount,
      workspace: workspace
    };
  };

  const refreshData = () => {
    fetchData();
  };

  return {
    workspaceTypes,
    durationDiscounts,
    loading,
    getDurationOptions,
    calculatePrice,
    getPriceBreakdown,
    refreshData
  };
};