import React, { useState } from 'react';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useContent } from '../hooks/useContent';
import { supabase } from '../lib/supabase';
import { useBooking } from '../contexts/BookingContext';
import { Navigate, Link } from 'react-router-dom';
import AdminBookingForm from '../components/AdminBookingForm';
import SubscriptionManagement from '../components/SubscriptionManagement';
import SessionManagement from '../components/SessionManagement';
import DurationDiscountManagement from '../components/DurationDiscountManagement';
import toast from 'react-hot-toast';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Settings, 
  CheckCircle, 
  XCircle,
  Edit,
  Trash2,
  Phone,
  Mail,
  Save,
  MessageCircle,
  Plus,
  Clock,
  Play,
  Percent
} from 'lucide-react';

interface Booking {
  id: string;
  workspace_type: string;
  date: string;
  time_slot: string;
  duration: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_whatsapp: string;
  total_price: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  confirmation_code: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RecentSession {
  id: string;
  user_id: string;
  session_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  status: string;
  user: {
    name: string;
    email: string;
  };
  booking?: {
    workspace_type: string;
    date: string;
    time_slot: string;
    customer_name: string;
  };
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { getSetting, updateSetting, settings, loading: contentLoading } = useContent();
  const [editingBooking, setEditingBooking] = useState<string | null>(null);
  const [editBookingData, setEditBookingData] = useState<Partial<Booking>>({});
  const [activeTab, setActiveTab] = useState('bookings');
  const [settingsTab, setSettingsTab] = useState<'general' | 'discounts'>('general');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdminBookingForm, setShowAdminBookingForm] = useState(false);
  const [stats, setStats] = useState({
    totalBookings: 0,
    activeMembers: 0,
    monthlyRevenue: 0,
    pendingBookings: 0,
    activeSessions: 0
  });

  // Settings state
  const [settingsData, setSettingsData] = useState({
    totalDesks: '',
    hourlySlots: '',
    bookingDurations: ''
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  // Today's bookings visualization state
  const [todaysBookings, setTodaysBookings] = useState<Booking[]>([]);
  const [hourlySlots, setHourlySlots] = useState<string[]>([]);

  useEffect(() => {
    fetchBookings();
    fetchStats();
    fetchRecentSessions();
    fetchTodaysBookings();
    fetchHourlySlots();
  }, []);

  // Load settings when content is loaded and settings are available
  useEffect(() => {
    if (!contentLoading && settings && Object.keys(settings).length > 0) {
      loadSettings();
    }
    
    // Set up real-time subscription for bookings
    const bookingsSubscription = supabase
      .channel('bookings_changes')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'bookings' 
        }, 
        (payload) => {
          console.log('New booking received:', payload.new);
          setBookings(prev => [payload.new as Booking, ...prev]);
          fetchStats(); // Refresh stats when new booking arrives
        }
      )
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'bookings' 
        }, 
        (payload) => {
          console.log('Booking updated:', payload.new);
          setBookings(prev => 
            prev.map(booking => 
              booking.id === payload.new.id ? payload.new as Booking : booking
            )
          );
          fetchStats(); // Refresh stats when booking is updated
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(bookingsSubscription);
    };
  }, [contentLoading, settings]);

  // Authentication check after all hooks are declared
  if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
    return <Navigate to="/login" replace />;
  }

  const fetchTodaysBookings = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', today)
        .in('status', ['pending', 'confirmed', 'code_sent']);

      if (error) throw error;
      setTodaysBookings(data || []);
    } catch (error) {
      console.error('Error fetching today\'s bookings:', error);
    }
  };

  const fetchHourlySlots = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'hourly_slots')
        .single();

      if (error) throw error;
      
      const slots = data?.value ? 
        data.value.split(',').map(slot => slot.trim()).filter(Boolean) :
        ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
      
      setHourlySlots(slots);
    } catch (error) {
      console.error('Error fetching hourly slots:', error);
      setHourlySlots(['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM']);
    }
  };

  const loadSettings = () => {
    console.log('Loading settings from:', settings);
    setSettingsData({
      totalDesks: settings['total_desks'] || '6',
      hourlySlots: settings['hourly_slots'] || '9:00 AM,10:00 AM,11:00 AM,12:00 PM,1:00 PM,2:00 PM,3:00 PM,4:00 PM,5:00 PM',
      bookingDurations: settings['booking_durations'] || '1 hour,2 hours,3 hours,4 hours,5 hours,6 hours'
    });
  };

  const handleSettingsChange = (field: string, value: string) => {
    setSettingsData(prev => ({ ...prev, [field]: value }));
  };

  const fetchBookings = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select(`
          id,
          user_id,
          session_type,
          start_time,
          end_time,
          duration_minutes,
          status,
          user:user_id (
            name,
            email
          ),
          booking:booking_id (
            workspace_type,
            date,
            time_slot,
            customer_name
          )
        `)
        .order('start_time', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentSessions(data || []);
    } catch (error) {
      console.error('Error fetching recent sessions:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const [bookingsResult, sessionsResult] = await Promise.all([
        supabase
        .from('bookings')
        .select('status, total_price, created_at'),
        supabase
        .from('user_sessions')
        .select('status')
        .eq('status', 'active')
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

      const bookingsData = bookingsResult.data;
      const sessionsData = sessionsResult.data;
      const totalBookings = bookingsData?.length || 0;
      const pendingBookings = bookingsData?.filter(b => b.status === 'pending' || b.status === 'code_sent').length || 0;
      const activeSessions = sessionsData?.length || 0;
      const monthlyRevenue = bookingsData
        ?.filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + (b.total_price || 0), 0) || 0;

      setStats({
        totalBookings,
        activeMembers: Math.floor(totalBookings * 0.7), // Mock calculation
        monthlyRevenue,
        pendingBookings,
        activeSessions
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    try {
      // Generate confirmation code
      const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Get booking data for webhook
      const { data: bookingData, error: fetchError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (fetchError) throw fetchError;

      // Update booking status to 'code_sent' and store confirmation code
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ 
          status: 'code_sent',
          confirmation_code: confirmationCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateError) throw updateError;

      // Send webhook notification with confirmation code
      try {
        await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'send_confirmation_code',
            bookingId: bookingId,
            confirmationCode: confirmationCode,
            customerData: {
              name: bookingData.customer_name,
              whatsapp: bookingData.customer_whatsapp,
              email: bookingData.customer_email,
              phone: bookingData.customer_phone
            },
            bookingDetails: {
              workspace_type: bookingData.workspace_type,
              date: bookingData.date,
              time_slot: bookingData.time_slot,
              duration: bookingData.duration,
              total_price: bookingData.total_price
            },
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook failed:', webhookError);
        // Don't fail the confirmation if webhook fails
      }
      
      // Note: Real-time subscription will automatically update the UI
      
      alert(`Confirmation code ${confirmationCode} sent to customer via WhatsApp!`);
    } catch (error) {
      console.error('Error confirming booking:', error);
      alert('Failed to send confirmation code. Please try again.');
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    if (confirm('Are you sure you want to reject this booking?')) {
      try {
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'rejected' })
          .eq('id', bookingId);

        if (error) throw error;

        // Send webhook notification for rejection
        try {
          await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'booking_rejected',
              bookingId: bookingId,
              timestamp: new Date().toISOString()
            })
          });
        } catch (webhookError) {
          console.error('Webhook failed:', webhookError);
        }
        
        // Note: Real-time subscription will automatically update the UI
        
        alert('Booking rejected successfully!');
      } catch (error) {
        console.error('Error rejecting booking:', error);
        alert('Failed to reject booking. Please try again.');
      }
    }
  };

  const startBookingSession = async (bookingId: string) => {
    try {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('user_id')
        .eq('id', bookingId)
        .single();

      if (bookingError) throw bookingError;

      const { error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: booking.user_id,
          booking_id: bookingId,
          session_type: 'booking',
          confirmation_required: true,
          started_by: user?.id,
          status: 'active'
        });

      if (error) throw error;

      toast.success('Booking session started');
      fetchBookings();
      fetchRecentSessions();
    } catch (error) {
      console.error('Error starting booking session:', error);
      toast.error('Failed to start booking session');
    }
  };

  const handleBookingSuccess = () => {
    // Refresh bookings and stats after successful admin booking
    fetchBookings();
    fetchStats();
    fetchRecentSessions();
  };

  const handleSaveBooking = async (bookingData: Partial<Booking>) => {
    if (!editingBooking) return;
    
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          date: bookingData.date,
          time_slot: bookingData.time_slot,
          duration: bookingData.duration,
          customer_name: bookingData.customer_name,
          customer_email: bookingData.customer_email,
          customer_phone: bookingData.customer_phone,
          customer_whatsapp: bookingData.customer_whatsapp,
          total_price: bookingData.total_price,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingBooking);

      if (error) throw error;

      setEditingBooking(null);
      setEditBookingData({});
      toast.success('Booking updated successfully');
      fetchBookings();
      fetchTodaysBookings(); // Refresh today's bookings visualization
    } catch (error) {
      console.error('Error updating booking:', error);
      toast.error('Failed to update booking. Please try again.');
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (error) throw error;

      toast.success('Booking deleted successfully');
      fetchBookings();
      fetchTodaysBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Failed to delete booking. Please try again.');
    }
  };

  const canEditBooking = (status: string) => {
    return status !== 'confirmed';
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      // Validate total desks
      const totalDesks = parseInt(settingsData.totalDesks);
      if (isNaN(totalDesks) || totalDesks < 1) {
        alert('Total desks must be a positive number');
        return;
      }

      // Validate hourly slots
      const slots = settingsData.hourlySlots.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (slots.length === 0) {
        alert('Please provide at least one hourly slot');
        return;
      }

      // Save settings
      await updateSetting('total_desks', settingsData.totalDesks);
      await updateSetting('hourly_slots', settingsData.hourlySlots);
      await updateSetting('booking_durations', settingsData.bookingDurations);

      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Today's bookings visualization
  const getTodaysBookingsBySlot = () => {
    const slotBookings: Record<string, number> = {};
    const totalDesks = parseInt(getSetting('total_desks', '6'));
    
    // Initialize all slots with 0 bookings
    hourlySlots.forEach(slot => {
      slotBookings[slot] = 0;
    });
    
    // Count bookings for each slot
    todaysBookings.forEach(booking => {
      if (slotBookings.hasOwnProperty(booking.time_slot)) {
        slotBookings[booking.time_slot]++;
      }
    });
    
    return { slotBookings, totalDesks };
  };

  const getSlotColor = (bookingCount: number, totalDesks: number) => {
    if (bookingCount === 0) return 'bg-green-100 border-green-300 text-green-800';
    if (bookingCount >= totalDesks) return 'bg-red-500 border-red-600 text-white';
    if (bookingCount >= totalDesks * 0.8) return 'bg-orange-400 border-orange-500 text-white';
    return 'bg-yellow-200 border-yellow-400 text-yellow-800';
  };

  const statsCards = [
    {
      title: 'Total Bookings',
      value: stats.totalBookings.toString(),
      change: '+12%',
      icon: Calendar,
      color: 'bg-blue-500'
    },
    {
      title: 'Active Members',
      value: stats.activeMembers.toString(),
      change: '+8%',
      icon: Users,
      color: 'bg-green-500'
    },
    {
      title: 'Monthly Revenue',
      value: `E£${stats.monthlyRevenue.toLocaleString()}`,
      change: '+15%',
      icon: DollarSign,
      color: 'bg-yellow-500'
    },
    {
      title: 'Pending Bookings',
      value: stats.pendingBookings.toString(),
      change: '+2',
      icon: Settings,
      color: 'bg-red-500'
    },
    {
      title: 'Active Sessions',
      value: stats.activeSessions.toString(),
      change: 'Live',
      icon: Clock,
      color: 'bg-purple-500'
    }
  ];

  return (
  <div className="min-h-screen bg-gray-50">
    {/* Header */}
    <div className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Manage your coworking space</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowAdminBookingForm(true)}
              className="bg-yellow-500 text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-600 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Booking
            </button>
            <Link
              to="/admin/clients"
              className="bg-blue-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-600 transition-colors flex items-center"
            >
              <Users className="w-4 h-4 mr-2" />
              Manage Clients
            </Link>
            <span className="text-sm text-gray-500">Welcome back, {user.name}</span>
          </div>
        </div>
      </div>
    </div>

    {/* Stats Cards */}
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Today's Bookings Visualization */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <div className="flex items-center mb-6">
          <Clock className="w-6 h-6 text-yellow-500 mr-3" />
          <h3 className="text-xl font-semibold text-gray-900">Today's Bookings Overview</h3>
          <span className="ml-2 text-sm text-gray-500">({new Date().toLocaleDateString()})</span>
        </div>
        
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
          {(() => {
            const { slotBookings, totalDesks } = getTodaysBookingsBySlot();
            return hourlySlots.map((slot) => {
              const bookingCount = slotBookings[slot] || 0;
              const colorClass = getSlotColor(bookingCount, totalDesks);
              
              return (
                <div
                  key={slot}
                  className={`p-3 rounded-lg border-2 text-center transition-all duration-200 hover:scale-105 ${colorClass}`}
                >
                  <div className="text-xs font-medium mb-1">{slot}</div>
                  <div className="text-lg font-bold">{bookingCount}</div>
                  <div className="text-xs opacity-75">/ {totalDesks}</div>
                </div>
              );
            });
          })()}
        </div>
        
        <div className="flex items-center justify-center mt-4 space-x-6 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-200 border border-yellow-400 rounded mr-2"></div>
            <span>Partially Booked</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-orange-400 border border-orange-500 rounded mr-2"></div>
            <span>Nearly Full</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-500 border border-red-600 rounded mr-2"></div>
            <span>Full</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                <p className="text-sm text-green-600">{stat.change}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'bookings'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Bookings
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sessions'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('recent-sessions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'recent-sessions'
                   ? 'border-yellow-500 text-yellow-600'
                   : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Recent Sessions
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'subscriptions'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Subscriptions
            </button>
            <Link
              to="/admin/clients"
              className="py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 font-medium text-sm"
            >
              Clients
            </Link>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
{activeTab === 'bookings' && (
          <div className="space-y-6">
            {/* Bookings Header with Search and Create Button */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">All Bookings</h3>
                <p className="text-sm text-gray-600">
                  Showing {filteredBookings.length} of {bookings.length} bookings
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 md:w-80">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search bookings by name, email, phone, workspace, status..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowBookingForm(true)}
                  className="bg-yellow-500 text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-600 transition-colors flex items-center whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Booking
                </button>
              </div>
            </div>

            {/* Search Results Info */}
            {searchTerm && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-blue-800 text-sm">
                  <Filter className="w-4 h-4 inline mr-1" />
                  Search results for "{searchTerm}" - {filteredBookings.length} booking(s) found
                </p>
              </div>
            )}

            {/* Bookings List */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Workspace
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500">
                            {searchTerm ? 'No bookings match your search criteria' : 'No bookings found'}
                          </p>
                          {searchTerm && (
                            <button
                              onClick={() => setSearchTerm('')}
                              className="mt-2 text-yellow-600 hover:text-yellow-500 text-sm"
                            >
                              Clear search
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((booking) => (
                        <tr key={booking.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {booking.customer_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {booking.customer_email}
                              </div>
                              <div className="text-xs text-gray-400">
                                {booking.customer_whatsapp}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{booking.workspace_type}</div>
                            <div className="text-sm text-gray-500">{booking.duration}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(booking.date).toLocaleDateString()}
                            </div>
                            <div className="text-sm text-gray-500">{booking.time_slot}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                              {booking.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            E£{booking.total_price}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                            {booking.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => {
                                    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                                    updateBookingStatus(booking.id, 'code_sent', code);
                                  }}
                                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-600 transition-colors"
                                >
                                  Send Code
                                </button>
                                <button
                                  onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                                  className="bg-green-500 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-600 transition-colors"
                                >
                                  <CheckCircle className="w-3 h-3 inline mr-1" />
                                  Confirm
                                </button>
                                <button
                                  onClick={() => updateBookingStatus(booking.id, 'rejected')}
                                  className="bg-red-500 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-red-600 transition-colors"
                                >
                                  <XCircle className="w-3 h-3 inline mr-1" />
                                  Reject
                                </button>
                              </>
                            )}

                            {booking.status === 'confirmed' && booking.user_id && (
                              <>
                                {isBookingSessionActive(booking.id) ? (
                                  <span className="bg-green-100 text-green-800 px-3 py-1 rounded text-xs font-semibold flex items-center">
                                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                                    Active
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => startBookingSession(booking.id, booking.user_id)}
                                    disabled={startingSession === booking.id}
                                    className="bg-green-500 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center"
                                  >
                                    {startingSession === booking.id ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                                        Starting...
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-3 h-3 mr-1" />
                                        Start Session
                                      </>
                                    )}
                                  </button>
                                )}
                              </>
                            )}

                            {booking.status === 'code_sent' && (
                              <div className="text-xs text-blue-600">
                                Code: {booking.confirmation_code}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

          {activeTab === 'analytics' && (
            <div>
              {/* Analytics content here */}
              <p className="text-gray-500">Analytics content coming soon.</p>
            </div>
          )}

          {activeTab === 'recent-sessions' && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Sessions</h3>
              {recentSessions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">No sessions found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentSessions.map((session) => (
                        <tr key={session.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{session.user.name}</div>
                              <div className="text-sm text-gray-500">{session.user.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              session.session_type === 'booking' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                            }`}>
                              {session.session_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(session.start_time).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {session.status === 'active' ? (
                              <span className="text-green-600 font-medium">Active</span>
                            ) : session.duration_minutes ? (
                              `${Math.floor(session.duration_minutes / 60)}h ${session.duration_minutes % 60}m`
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              session.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {session.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {session.booking && (
                              <div>
                                <p>Client: {session.booking.customer_name}</p>
                                <p>{session.booking.workspace_type}</p>
                                <p>{new Date(session.booking.date).toLocaleDateString()} {session.booking.time_slot}</p>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <SessionManagement />
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionManagement />
          )}

            {activeTab === 'settings' && (
              user.role === 'admin' ? (
              <div className="space-y-6">
                <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setSettingsTab('general')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center ${
                      settingsTab === 'general'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    General Settings
                  </button>
                  <button
                    onClick={() => setSettingsTab('discounts')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center ${
                      settingsTab === 'discounts'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Percent className="w-4 h-4 mr-2" />
                    Duration Discounts
                  </button>
                </div>

                {settingsTab === 'general' && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-6">Booking System Settings</h3>
                    
                    <div className="space-y-6">
                      {/* Total Desks Setting */}
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Total Number of Desks</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Set the total number of desks available for booking. This affects how many simultaneous bookings can be made for the same time slot.
                        </p>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={settingsData.totalDesks}
                          onChange={(e) => handleSettingsChange('totalDesks', e.target.value)}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          placeholder="6"
                        />
                        <span className="ml-2 text-sm text-gray-500">desks</span>
                      </div>

                      {/* Hourly Slots Setting */}
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Available Hourly Time Slots</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Define the available hourly time slots for booking. Enter each time slot separated by commas.
                          Example: 9:00 AM,10:00 AM,11:00 AM,12:00 PM,1:00 PM
                        </p>
                        <textarea
                          rows={4}
                          value={settingsData.hourlySlots}
                          onChange={(e) => handleSettingsChange('hourlySlots', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          placeholder="9:00 AM,10:00 AM,11:00 AM,12:00 PM,1:00 PM,2:00 PM,3:00 PM,4:00 PM,5:00 PM"
                        />
                        <div className="mt-2 text-xs text-gray-500">
                          Current slots: {settingsData.hourlySlots.split(',').map(s => s.trim()).filter(s => s.length > 0).length} slots
                        </div>
                      </div>

                      {/* Booking Durations Setting */}
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Available Booking Durations</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Define the available booking durations. Enter each duration separated by commas.
                          Example: 1 hour,2 hours,3 hours,4 hours,5 hours,6 hours
                        </p>
                        <textarea
                          rows={3}
                          value={settingsData.bookingDurations}
                          onChange={(e) => handleSettingsChange('bookingDurations', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          placeholder="1 hour,2 hours,3 hours,4 hours,5 hours,6 hours"
                        />
                        <div className="mt-2 text-xs text-gray-500">
                          Current durations: {settingsData.bookingDurations.split(',').map(s => s.trim()).filter(s => s.length > 0).length} options
                        </div>
                      </div>
                      {/* Save Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={saveSettings}
                          disabled={settingsSaving}
                          className="bg-yellow-500 text-black px-6 py-2 rounded-md font-semibold hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {settingsSaving ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Settings
                            </>
                          )}
                        </button>
                      </div>

                      {/* Warning Notice */}
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex">
                          <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800">Important Notice</h3>
                            <div className="mt-2 text-sm text-yellow-700">
                              <p>Changes to these settings will affect future bookings. Existing bookings will remain unchanged. Please ensure you understand the impact before making changes.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === 'discounts' && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Duration Discounts</h3>
                    <DurationDiscountManagement />
                  </div>
                )}
              </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Settings are only accessible to administrators.</p>
                </div>
              )
            )}
          </div>
        </div>

      </div>

      {/* Admin Booking Form Modal */}
      {showAdminBookingForm && (
        <AdminBookingForm
          onClose={() => setShowAdminBookingForm(false)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
};

export default AdminDashboard;