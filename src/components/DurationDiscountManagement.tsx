import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, Save, X, Percent, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

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
  created_at: string;
  updated_at: string;
  workspace_type: {
    name: string;
    price: number;
  };
}

const DurationDiscountManagement: React.FC = () => {
  const { user } = useAuth();
  const [workspaceTypes, setWorkspaceTypes] = useState<WorkspaceType[]>([]);
  const [discounts, setDiscounts] = useState<DurationDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDiscount, setEditingDiscount] = useState<string | null>(null);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [formData, setFormData] = useState({
    workspace_type_id: '',
    duration: '',
    discount_percentage: 0,
    fixed_price: null as number | null,
    discount_type: 'percentage' as 'percentage' | 'fixed'
  });

  const durations = [
    '1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours'
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch workspace types and discounts in parallel
      const [workspaceResult, discountResult] = await Promise.all([
        supabase
          .from('workspace_types')
          .select('id, name, price, price_unit')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('duration_discounts')
          .select(`
            *,
            workspace_type:workspace_type_id (
              name,
              price
            )
          `)
          .order('workspace_type_id', { ascending: true })
      ]);

      if (workspaceResult.error) throw workspaceResult.error;
      if (discountResult.error) throw discountResult.error;

      setWorkspaceTypes(workspaceResult.data || []);
      setDiscounts(discountResult.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load discount data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.workspace_type_id || !formData.duration) {
      toast.error('Please select workspace type and duration');
      return;
    }

    if (formData.discount_type === 'percentage' && (formData.discount_percentage < 0 || formData.discount_percentage > 100)) {
      toast.error('Discount percentage must be between 0 and 100');
      return;
    }

    if (formData.discount_type === 'fixed' && (!formData.fixed_price || formData.fixed_price < 0)) {
      toast.error('Fixed price must be a positive number');
      return;
    }

    try {
      const discountData = {
        workspace_type_id: formData.workspace_type_id,
        duration: formData.duration,
        discount_percentage: formData.discount_type === 'percentage' ? formData.discount_percentage : 0,
        fixed_price: formData.discount_type === 'fixed' ? formData.fixed_price : null,
        is_active: true
      };

      if (editingDiscount) {
        const { error } = await supabase
          .from('duration_discounts')
          .update(discountData)
          .eq('id', editingDiscount);

        if (error) throw error;
        toast.success('Discount updated successfully');
        setEditingDiscount(null);
      } else {
        const { error } = await supabase
          .from('duration_discounts')
          .insert([discountData]);

        if (error) throw error;
        toast.success('Discount created successfully');
        setCreatingDiscount(false);
      }

      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving discount:', error);
      toast.error('Failed to save discount');
    }
  };

  const resetForm = () => {
    setFormData({
      workspace_type_id: '',
      duration: '',
      discount_percentage: 0,
      fixed_price: null,
      discount_type: 'percentage'
    });
  };

  const startEdit = (discount: DurationDiscount) => {
    setEditingDiscount(discount.id);
    setFormData({
      workspace_type_id: discount.workspace_type_id,
      duration: discount.duration,
      discount_percentage: discount.discount_percentage,
      fixed_price: discount.fixed_price,
      discount_type: discount.fixed_price !== null ? 'fixed' : 'percentage'
    });
  };

  const cancelEdit = () => {
    setEditingDiscount(null);
    setCreatingDiscount(false);
    resetForm();
  };

  const toggleDiscountStatus = async (discountId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('duration_discounts')
        .update({ is_active: !currentStatus })
        .eq('id', discountId);

      if (error) throw error;
      toast.success(`Discount ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchData();
    } catch (error) {
      console.error('Error updating discount status:', error);
      toast.error('Failed to update discount status');
    }
  };

  const deleteDiscount = async (discountId: string) => {
    if (!confirm('Are you sure you want to delete this discount? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('duration_discounts')
        .delete()
        .eq('id', discountId);

      if (error) throw error;
      toast.success('Discount deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting discount:', error);
      toast.error('Failed to delete discount');
    }
  };

  const calculateDiscountedPrice = (workspaceTypeId: string, duration: string, discount: DurationDiscount) => {
    const workspace = workspaceTypes.find(w => w.id === workspaceTypeId);
    if (!workspace) return 0;

    const durationMultiplier = parseInt(duration.split(' ')[0]);
    const originalPrice = workspace.price * durationMultiplier;

    if (discount.fixed_price !== null) {
      return discount.fixed_price;
    } else {
      const discountAmount = (originalPrice * discount.discount_percentage) / 100;
      return originalPrice - discountAmount;
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Only administrators can manage duration discounts.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Duration Discounts</h3>
        <button
          onClick={() => setCreatingDiscount(true)}
          className="bg-yellow-500 text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-600 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Discount
        </button>
      </div>

      {/* Create/Edit Form */}
      {(creatingDiscount || editingDiscount) && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h4 className="text-md font-semibold mb-4">
            {editingDiscount ? 'Edit Discount' : 'Create New Discount'}
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workspace Type
                </label>
                <select
                  value={formData.workspace_type_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, workspace_type_id: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">Select workspace type...</option>
                  {workspaceTypes.map(workspace => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} (E£{workspace.price}/{workspace.price_unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration
                </label>
                <select
                  value={formData.duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">Select duration...</option>
                  {durations.map(duration => (
                    <option key={duration} value={duration}>
                      {duration}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Type
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="percentage"
                    checked={formData.discount_type === 'percentage'}
                    onChange={(e) => setFormData(prev => ({ ...prev, discount_type: e.target.value as 'percentage' | 'fixed' }))}
                    className="mr-2"
                  />
                  Percentage Discount
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="fixed"
                    checked={formData.discount_type === 'fixed'}
                    onChange={(e) => setFormData(prev => ({ ...prev, discount_type: e.target.value as 'percentage' | 'fixed' }))}
                    className="mr-2"
                  />
                  Fixed Price
                </label>
              </div>
            </div>

            {formData.discount_type === 'percentage' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Percentage (0-100%)
                </label>
                <input
                  type="number"
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_percentage: parseFloat(e.target.value) || 0 }))}
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fixed Price (E£)
                </label>
                <input
                  type="number"
                  value={formData.fixed_price || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, fixed_price: parseFloat(e.target.value) || null }))}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            )}

            {/* Price Preview */}
            {formData.workspace_type_id && formData.duration && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h5 className="text-sm font-semibold text-blue-900 mb-2">Price Preview</h5>
                {(() => {
                  const workspace = workspaceTypes.find(w => w.id === formData.workspace_type_id);
                  if (!workspace) return null;

                  const durationMultiplier = parseInt(formData.duration.split(' ')[0]);
                  const originalPrice = workspace.price * durationMultiplier;
                  
                  let discountedPrice = originalPrice;
                  if (formData.discount_type === 'percentage' && formData.discount_percentage > 0) {
                    const discountAmount = (originalPrice * formData.discount_percentage) / 100;
                    discountedPrice = originalPrice - discountAmount;
                  } else if (formData.discount_type === 'fixed' && formData.fixed_price) {
                    discountedPrice = formData.fixed_price;
                  }

                  const savings = originalPrice - discountedPrice;

                  return (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-blue-700">Original Price:</span>
                        <span className="text-blue-700">E£{originalPrice}</span>
                      </div>
                      {savings > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-green-700">Savings:</span>
                            <span className="text-green-700">-E£{savings.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span className="text-blue-900">Final Price:</span>
                            <span className="text-blue-900">E£{discountedPrice.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-green-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-green-600 transition-colors flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingDiscount ? 'Update Discount' : 'Create Discount'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-gray-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-gray-600 transition-colors flex items-center"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Discounts List */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workspace Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Original Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Discount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Final Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {discounts.map((discount) => {
                const workspace = workspaceTypes.find(w => w.id === discount.workspace_type_id);
                const durationMultiplier = parseInt(discount.duration.split(' ')[0]);
                const originalPrice = workspace ? workspace.price * durationMultiplier : 0;
                const finalPrice = calculateDiscountedPrice(discount.workspace_type_id, discount.duration, discount);
                const savings = originalPrice - finalPrice;

                return (
                  <tr key={discount.id} className={!discount.is_active ? 'opacity-60' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {discount.workspace_type.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {discount.duration}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      E£{originalPrice}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {discount.fixed_price !== null ? (
                        <span className="flex items-center text-blue-600">
                          <DollarSign className="w-4 h-4 mr-1" />
                          Fixed: E£{discount.fixed_price}
                        </span>
                      ) : (
                        <span className="flex items-center text-green-600">
                          <Percent className="w-4 h-4 mr-1" />
                          {discount.discount_percentage}%
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      E£{finalPrice.toFixed(2)}
                      {savings > 0 && (
                        <div className="text-xs text-green-600">
                          Save E£{savings.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        discount.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {discount.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => startEdit(discount)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleDiscountStatus(discount.id, discount.is_active)}
                        className={`${
                          discount.is_active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                        }`}
                      >
                        {discount.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => deleteDiscount(discount.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {discounts.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No duration discounts found. Create one to get started!</p>
        </div>
      )}
    </div>
  );
};

export default DurationDiscountManagement;