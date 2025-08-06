import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Navigate, Link } from 'react-router-dom';
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
  Clock, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Play,
  Search,
  Filter
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
}

interface ActiveBookingSession {
  id: string;
  booking_id: string;
  user_id: string;
  start_time: string;
  status: string;
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'sessions' | 'subscriptions' | 'discounts'>('overview');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [activeBookingSessions, setActiveBookingSessions] = useState<ActiveBookingSession[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    confirmedBookings: 0,
    totalRevenue: 0,
    activeUsers: 0
  });
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [startingSession, setStartingSession] = useState<string | null>(null);

  if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
    return <Navigate to="/login" replace />;
  }

  useEffect(() => {
    fetchDashboardData();
    fetchActiveBookingSessions();
    
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
          fetchActiveBookingSessions();
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
  }, [bookings, searchTerm]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;

      const allBookings = bookingsData || [];
      setBookings(allBookings);

      // Calculate statistics
      const totalBookings = allBookings.length;
      const pendingBookings = allBookings.filter(b => b.status === 'pending').length;
      const confirmedBookings = allBookings.filter(b => b.status === 'confirmed').length;
      const totalRevenue = allBookings
        .filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + b.total_price, 0);

      // Fetch active users count (only for admins)
      let activeUsers = 0;
      if (user.role === 'admin') {
        const { count, error: usersError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'customer');

        if (usersError) throw usersError;
        activeUsers = count || 0;
      }

      setStats({
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalRevenue,
        activeUsers
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveBookingSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('id, booking_id, user_id, start_time, status')
        .eq('session_type', 'booking')
        .eq('status', 'active');

      if (error) throw error;
      setActiveBookingSessions(data || []);
    } catch (error) {
      console.error('Error fetching active booking sessions:', error);
    }
  };

  const filterBookings = () => {
    if (!searchTerm.trim()) {
      setFilteredBookings(bookings);
      return;
    }

    const filtered = bookings.filter(booking => {
      const searchLower = searchTerm.toLowerCase();
      return (
        booking.workspace_type.toLowerCase().includes(searchLower) ||
        booking.customer_name.toLowerCase().includes(searchLower) ||
        booking.customer_email.toLowerCase().includes(searchLower) ||
        booking.customer_phone.includes(searchTerm) ||
        booking.customer_whatsapp.includes(searchTerm) ||
        booking.status.toLowerCase().includes(searchLower) ||
        booking.date.includes(searchTerm) ||
        booking.time_slot.toLowerCase().includes(searchLower) ||
        booking.duration.toLowerCase().includes(searchLower) ||
        (booking.confirmation_code && booking.confirmation_code.includes(searchTerm)) ||
        booking.id.includes(searchTerm)
      );
    });

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

      // Send webhook notification
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        try {
          await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: newStatus === 'code_sent' ? 'confirmation_code_sent' : `booking_${newStatus}`,
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

      toast.success(`Booking ${newStatus.replace('_', ' ')} successfully!`);
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Failed to update booking status');
    }
  };

  const startBookingSession = async (bookingId: string, userId: string | null) => {
    if (!userId) {
      toast.error('Cannot start session: No user associated with this booking');
      return;
    }

    setStartingSession(bookingId);
    
    try {
      // Check if user already has an active session
      const { data: existingSession, error: checkError } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingSession) {
        toast.error('User already has an active session');
        return;
      }

      // Start the session
      const { error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: userId,
          booking_id: bookingId,
          session_type: 'booking',
          started_by: user?.id,
          status: 'active'
        });

      if (error) throw error;

      toast.success('Booking session started successfully');
      fetchActiveBookingSessions();
    } catch (error) {
      console.error('Error starting booking session:', error);
      toast.error('Failed to start session');
    } finally {
      setStartingSession(null);
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

  const isBookingSessionActive = (bookingId: string) => {
    return activeBookingSessions.some(session => session.booking_id === bookingId);
  };

  const getTodaysBookings = () => {
    const today = new Date().toISOString().split('T')[0];
    return bookings.filter(booking => booking.date === today);
  };

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading dashboard..." />;
  }

  const todaysBookings = getTodaysBookings();

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
              <p className="text-gray-600">Welcome back, {user.name}</p>
            </div>
            <div className="flex space-x-4">
              <Link
                to="/admin/clients"
                className="bg-blue-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-600 transition-colors"
              >
                Manage Clients
              </Link>
              {user.role === 'admin' && (
                <Link
                  to="/cms"
                  className="bg-purple-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-purple-600 transition-colors"
                >
                  Content Management
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'bookings'
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Bookings
              </button>
              <button
                onClick={() => setActiveTab('sessions')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'sessions'
                    ? 'border-yellow-500 text-yellow-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Sessions
              </button>
              {user.role === 'admin' && (
                <>
                  <button
                    onClick={() => setActiveTab('subscriptions')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'subscriptions'
                        ? 'border-yellow-500 text-yellow-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Subscriptions
                  </button>
                  <button
                    onClick={() => setActiveTab('discounts')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'discounts'
                        ? 'border-yellow-500 text-yellow-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Discounts
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AnimatedSection animation="slideUp" duration={600}>
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <Calendar className="w-8 h-8 text-blue-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Bookings</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalBookings}</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection animation="slideUp" delay={100} duration={600}>
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="flex items-center">
                    <Clock className="w-8 h-8 text-yellow-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Pending</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.pendingBookings}</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>

              {/* Only show revenue for admins */}
              {user.role === 'admin' && (
                <AnimatedSection animation="slideUp" delay={200} duration={600}>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center">
                      <DollarSign className="w-8 h-8 text-green-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Revenue</p>
                        <p className="text-2xl font-bold text-gray-900">E£{stats.totalRevenue}</p>
                      </div>
                    </div>
                  </div>
                </AnimatedSection>
              )}

              {/* Only show active users for admins */}
              {user.role === 'admin' && (
                <AnimatedSection animation="slideUp" delay={300} duration={600}>
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center">
                      <Users className="w-8 h-8 text-purple-500" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Active Users</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.activeUsers}</p>
                      </div>
                    </div>
                  </div>
                </AnimatedSection>
              )}
            </div>

            {/* Today's Bookings Overview */}
            <AnimatedSection animation="slideUp" delay={400} duration={600}>
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Bookings</h3>
                {todaysBookings.length === 0 ? (
                  <p className="text-gray-500">No bookings for today.</p>
                ) : (
                  <div className="space-y-3">
                    {todaysBookings.slice(0, 5).map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{booking.customer_name}</p>
                          <p className="text-sm text-gray-600">
                            {booking.workspace_type} • {booking.time_slot} • {booking.duration}
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(booking.status)}`}>
                          {booking.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    ))}
                    {todaysBookings.length > 5 && (
                      <p className="text-sm text-gray-500 text-center">
                        And {todaysBookings.length - 5} more bookings...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </AnimatedSection>
          </div>
        )}

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

        {activeTab === 'sessions' && <SessionManagement />}
        
        {activeTab === 'subscriptions' && user.role === 'admin' && <SubscriptionManagement />}
        
        {activeTab === 'discounts' && user.role === 'admin' && <DurationDiscountManagement />}
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