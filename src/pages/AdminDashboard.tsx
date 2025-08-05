import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Navigate } from 'react-router-dom';
import AnimatedSection from '../components/AnimatedSection';
import LoadingSpinner from '../components/LoadingSpinner';
import AdminBookingForm from '../components/AdminBookingForm';
import SessionManagement from '../components/SessionManagement';
import SubscriptionManagement from '../components/SubscriptionManagement';
import DurationDiscountManagement from '../components/DurationDiscountManagement';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Settings, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search,
  Play,
  Square,
  UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

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
  status: 'pending' | 'code_sent' | 'confirmed' | 'rejected' | 'cancelled';
  confirmation_code: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  desk_number: number | null;
}

interface DashboardStats {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  totalRevenue: number;
  activeUsers: number;
}

interface ActiveSession {
  id: string;
  user_id: string;
  booking_id: string | null;
  session_type: string;
  start_time: string;
  status: string;
  user: {
    name: string;
    email: string;
  };
  booking?: {
    id: string;
    customer_name: string;
    customer_email: string;
    workspace_type: string;
    date: string;
    time_slot: string;
    duration: string;
  };
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'sessions' | 'subscriptions' | 'discounts' | 'settings'>('overview');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    totalRevenue: 0,
    activeUsers: 0
  });
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState({
    total_desks: '6',
    hourly_slots: '9:00 AM,10:00 AM,11:00 AM,12:00 PM,1:00 PM,2:00 PM,3:00 PM,4:00 PM,5:00 PM',
    booking_durations: '1 hour,2 hours,3 hours,4 hours,5 hours,6 hours'
  });
  const [savingSettings, setSavingSettings] = useState(false);

  if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
    return <Navigate to="/login" replace />;
  }

  useEffect(() => {
    fetchDashboardData();
    fetchSettings();
    
    // Set up real-time subscriptions
    const bookingsSubscription = supabase
      .channel('admin_bookings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'bookings' }, 
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    const sessionsSubscription = supabase
      .channel('admin_sessions')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'user_sessions' }, 
        () => {
          fetchActiveSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsSubscription);
      supabase.removeChannel(sessionsSubscription);
    };
  }, []);

  useEffect(() => {
    filterBookings();
  }, [bookings, searchTerm, statusFilter]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;
      setBookings(bookingsData || []);

      // Fetch active sessions
      await fetchActiveSessions();

      // Calculate stats
      const totalBookings = bookingsData?.length || 0;
      const pendingBookings = bookingsData?.filter(b => b.status === 'pending').length || 0;
      const confirmedBookings = bookingsData?.filter(b => b.status === 'confirmed').length || 0;
      const totalRevenue = bookingsData?.reduce((sum, b) => sum + (b.total_price || 0), 0) || 0;

      // Get active users count (users with sessions in the last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: activeUsersData, error: activeUsersError } = await supabase
        .from('user_sessions')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (activeUsersError) throw activeUsersError;
      
      const uniqueActiveUsers = new Set(activeUsersData?.map(s => s.user_id) || []).size;

      setStats({
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalRevenue,
        activeUsers: uniqueActiveUsers
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select(`
          id,
          user_id,
          booking_id,
          session_type,
          start_time,
          status,
          user:user_id (
            name,
            email
          ),
          booking:booking_id (
            id,
            customer_name,
            customer_email,
            workspace_type,
            date,
            time_slot,
            duration
          )
        `)
        .eq('status', 'active')
        .order('start_time', { ascending: false });

      if (error) throw error;
      setActiveSessions(data || []);
    } catch (error) {
      console.error('Error fetching active sessions:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', ['total_desks', 'hourly_slots', 'booking_durations']);

      if (error) throw error;

      const settingsMap = data?.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, string>) || {};

      setSettings(prev => ({
        ...prev,
        ...settingsMap
      }));
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const filterBookings = () => {
    let filtered = [...bookings];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(booking => 
        booking.customer_name.toLowerCase().includes(searchLower) ||
        booking.customer_email.toLowerCase().includes(searchLower) ||
        booking.customer_phone.includes(searchTerm) ||
        booking.customer_whatsapp.includes(searchTerm) ||
        booking.workspace_type.toLowerCase().includes(searchLower) ||
        booking.id.toLowerCase().includes(searchLower) ||
        booking.date.includes(searchTerm) ||
        booking.time_slot.toLowerCase().includes(searchLower) ||
        booking.duration.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(booking => booking.status === statusFilter);
    }

    setFilteredBookings(filtered);
  };

  const updateBookingStatus = async (bookingId: string, newStatus: string, confirmationCode?: string) => {
    try {
      const updateData: any = { 
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      
      if (confirmationCode) {
        updateData.confirmation_code = confirmationCode;
      }

      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', bookingId);

      if (error) throw error;

      // Get booking details for webhook
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        try {
          await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: `booking_${newStatus}_by_admin`,
              bookingId,
              confirmationCode: confirmationCode || null,
              adminUser: user?.name || 'Admin',
              customerData: {
                name: booking.customer_name,
                whatsapp: booking.customer_whatsapp,
                email: booking.customer_email
              },
              bookingDetails: {
                workspace_type: booking.workspace_type,
                date: booking.date,
                time_slot: booking.time_slot,
                duration: booking.duration,
                total_price: booking.total_price
              },
              timestamp: new Date().toISOString()
            })
          });
        } catch (webhookError) {
          console.error('Webhook failed:', webhookError);
        }
      }

      toast.success(`Booking ${newStatus} successfully`);
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Failed to update booking status');
    }
  };

  const startBookingSession = async (bookingId: string) => {
    setStartingSession(bookingId);
    
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if session already exists for this booking
      const { data: existingSession, error: checkError } = await supabase
        .from('user_sessions')
        .select('id, status')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingSession) {
        if (existingSession.status === 'active') {
          toast.error('Session is already active for this booking');
          return;
        }
      }

      // Start the session
      const { error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: booking.user_id || user?.id,
          booking_id: bookingId,
          session_type: 'booking',
          started_by: user?.id,
          status: 'active'
        });

      if (error) throw error;

      toast.success('Booking session started successfully');
      fetchDashboardData();
    } catch (error) {
      console.error('Error starting booking session:', error);
      toast.error('Failed to start booking session');
    } finally {
      setStartingSession(null);
    }
  };

  const endBookingSession = async (sessionId: string) => {
    setEndingSession(sessionId);
    
    try {
      // Get session details
      const { data: session, error: sessionError } = await supabase
        .from('user_sessions')
        .select(`
          id,
          user_id,
          booking_id,
          start_time,
          booking:booking_id (
            customer_name,
            customer_email,
            customer_phone,
            customer_whatsapp,
            workspace_type,
            date,
            time_slot,
            duration,
            total_price
          )
        `)
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const endTime = new Date();
      const startTime = new Date(session.start_time);
      const durationMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60));

      // Update session
      const { error: updateError } = await supabase
        .from('user_sessions')
        .update({
          end_time: endTime.toISOString(),
          duration_minutes: durationMinutes,
          status: 'completed',
          ended_by: user?.id,
          confirmation_required: true
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      // Send webhook notification
      try {
        await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'booking_session_ended_by_admin',
            sessionId: sessionId,
            userId: session.user_id,
            customerData: {
              name: session.booking.customer_name,
              email: session.booking.customer_email,
              phone: session.booking.customer_phone,
              whatsapp: session.booking.customer_whatsapp
            },
            bookingDetails: {
              workspace_type: session.booking.workspace_type,
              date: session.booking.date,
              time_slot: session.booking.time_slot,
              duration: session.booking.duration,
              total_price: session.booking.total_price
            },
            sessionDetails: {
              start_time: session.start_time,
              end_time: endTime.toISOString(),
              duration_minutes: durationMinutes
            },
            endedBy: user?.name,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook failed:', webhookError);
      }

      toast.success(`Session ended. Duration: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`);
      fetchDashboardData();
    } catch (error) {
      console.error('Error ending session:', error);
      toast.error('Failed to end session');
    } finally {
      setEndingSession(null);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const updates = Object.entries(settings).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(update, { onConflict: 'key' });
        
        if (error) throw error;
      }

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'code_sent':
        return 'bg-blue-100 text-blue-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getBookingActiveSession = (bookingId: string) => {
    return activeSessions.find(session => 
      session.booking_id === bookingId && session.status === 'active'
    );
  };

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading dashboard..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {user.role === 'admin' ? 'Admin Dashboard' : 'Staff Dashboard'}
              </h1>
              <p className="text-gray-600">
                {user.role === 'admin' ? 'Manage bookings, users, and system settings' : 'Manage bookings and sessions'}
              </p>
            </div>
            <button
              onClick={() => setShowBookingForm(true)}
              className="bg-yellow-500 text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-600 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Booking
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards - Only show revenue and active users to admins */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatedSection animation="slideUp" duration={600}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <Calendar className="w-8 h-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Bookings</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalBookings}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center">
                <Clock className="w-8 h-8 text-yellow-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingBookings}</p>
                </div>
              </div>
            </div>

            {/* Only show revenue to admins */}
            {user.role === 'admin' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <DollarSign className="w-8 h-8 text-green-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900">E£{stats.totalRevenue}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Only show active users to admins */}
            {user.role === 'admin' && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center">
                  <Users className="w-8 h-8 text-purple-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Active Users</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* Tabs */}
        <AnimatedSection animation="slideUp" delay={200} duration={600}>
          <div className="bg-white rounded-lg shadow-sm mb-8">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 px-6">
                {[
                  { id: 'overview', label: 'Overview', icon: Calendar },
                  { id: 'bookings', label: 'Bookings', icon: Calendar },
                  { id: 'sessions', label: 'Sessions', icon: Clock },
                  ...(user.role === 'admin' ? [
                    { id: 'subscriptions', label: 'Subscriptions', icon: UserCheck },
                    { id: 'discounts', label: 'Discounts', icon: DollarSign },
                    { id: 'settings', label: 'Settings', icon: Settings }
                  ] : [])
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                      activeTab === tab.id
                        ? 'border-yellow-500 text-yellow-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className="w-4 h-4 mr-2" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">Dashboard Overview</h3>
                  
                  {/* Recent Bookings */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-4">Recent Bookings</h4>
                    <div className="space-y-3">
                      {bookings.slice(0, 5).map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{booking.customer_name}</p>
                            <p className="text-sm text-gray-600">{booking.workspace_type} - {new Date(booking.date).toLocaleDateString()}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(booking.status)}`}>
                            {booking.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-4">Active Sessions ({activeSessions.length})</h4>
                    {activeSessions.length === 0 ? (
                      <p className="text-gray-500">No active sessions</p>
                    ) : (
                      <div className="space-y-3">
                        {activeSessions.slice(0, 5).map((session) => (
                          <div key={session.id} className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                            <div>
                              <p className="font-medium">
                                {session.session_type === 'booking' && session.booking 
                                  ? session.booking.customer_name 
                                  : session.user.name}
                              </p>
                              <p className="text-sm text-gray-600">
                                {session.session_type === 'booking' && session.booking
                                  ? `${session.booking.workspace_type} - ${session.booking.time_slot}`
                                  : 'Subscription Session'
                                }
                              </p>
                            </div>
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                              <span className="text-sm text-green-700">Active</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bookings Tab */}
              {activeTab === 'bookings' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-900">All Bookings</h3>
                  </div>

                  {/* Search and Filter */}
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <Search className="w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Search by customer name, email, phone, workspace, booking ID, date, or time..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="code_sent">Code Sent</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  {/* Results count */}
                  <div className="text-sm text-gray-600">
                    Showing {filteredBookings.length} of {bookings.length} bookings
                    {searchTerm && ` matching "${searchTerm}"`}
                    {statusFilter !== 'all' && ` with status "${statusFilter}"`}
                  </div>

                  {/* Bookings Table */}
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
                              Price
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
                          {filteredBookings.map((booking) => {
                            const activeSession = getBookingActiveSession(booking.id);
                            
                            return (
                              <tr key={booking.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {booking.customer_name}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {booking.customer_email}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {booking.customer_whatsapp}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">{booking.workspace_type}</div>
                                  <div className="text-sm text-gray-500">{booking.duration}</div>
                                  {booking.desk_number && (
                                    <div className="text-xs text-gray-400">Desk #{booking.desk_number}</div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">
                                    {new Date(booking.date).toLocaleDateString()}
                                  </div>
                                  <div className="text-sm text-gray-500">{booking.time_slot}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">
                                    E£{booking.total_price}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                                    {booking.status.replace('_', ' ').toUpperCase()}
                                  </span>
                                  {activeSession && (
                                    <div className="mt-1">
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                        SESSION ACTIVE
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                  {booking.status === 'pending' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                                          updateBookingStatus(booking.id, 'code_sent', code);
                                        }}
                                        className="text-blue-600 hover:text-blue-800"
                                      >
                                        Send Code
                                      </button>
                                      <button
                                        onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                                        className="text-green-600 hover:text-green-800"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => updateBookingStatus(booking.id, 'rejected')}
                                        className="text-red-600 hover:text-red-800"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                  
                                  {booking.status === 'confirmed' && !activeSession && (
                                    <button
                                      onClick={() => startBookingSession(booking.id)}
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

                                  {activeSession && (
                                    <button
                                      onClick={() => endBookingSession(activeSession.id)}
                                      disabled={endingSession === activeSession.id}
                                      className="bg-red-500 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center"
                                    >
                                      {endingSession === activeSession.id ? (
                                        <>
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                                          Ending...
                                        </>
                                      ) : (
                                        <>
                                          <Square className="w-3 h-3 mr-1" />
                                          End Session
                                        </>
                                      )}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {filteredBookings.length === 0 && (
                    <div className="text-center py-8">
                      <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        No bookings found
                      </h3>
                      <p className="text-gray-600">
                        {searchTerm || statusFilter !== 'all' 
                          ? 'Try adjusting your search or filter criteria.'
                          : 'No bookings have been made yet.'
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Sessions Tab */}
              {activeTab === 'sessions' && <SessionManagement />}

              {/* Subscriptions Tab - Admin only */}
              {activeTab === 'subscriptions' && user.role === 'admin' && <SubscriptionManagement />}

              {/* Discounts Tab - Admin only */}
              {activeTab === 'discounts' && user.role === 'admin' && <DurationDiscountManagement />}

              {/* Settings Tab - Admin only */}
              {activeTab === 'settings' && user.role === 'admin' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">System Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total Desks
                      </label>
                      <input
                        type="number"
                        value={settings.total_desks}
                        onChange={(e) => setSettings(prev => ({ ...prev, total_desks: e.target.value }))}
                        min="1"
                        max="50"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hourly Slots (comma-separated)
                      </label>
                      <textarea
                        value={settings.hourly_slots}
                        onChange={(e) => setSettings(prev => ({ ...prev, hourly_slots: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="9:00 AM,10:00 AM,11:00 AM,..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Booking Durations (comma-separated)
                      </label>
                      <textarea
                        value={settings.booking_durations}
                        onChange={(e) => setSettings(prev => ({ ...prev, booking_durations: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="1 hour,2 hours,3 hours,..."
                      />
                    </div>
                  </div>

                  <button
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="bg-yellow-500 text-black px-6 py-2 rounded-md font-semibold hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </AnimatedSection>
      </div>

      {/* Admin Booking Form Modal */}
      {showBookingForm && (
        <AdminBookingForm
          onClose={() => setShowBookingForm(false)}
          onSuccess={() => {
            setShowBookingForm(false);
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;