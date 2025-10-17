import  { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';


// --- Configuration ---
const API_BASE_URL = 'https://complai-smart-predict.onrender.com/';

// --- SVG Icons ---
const LogoIcon = () => ( <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="#B08D57" strokeWidth="2" strokeLinejoin="round"/><path d="M2 7L12 12L22 7" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 12V22" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 15.5L12 12" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 15.5L12 12" stroke="#B08D57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> );
const CheckCircleIcon = () => ( <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> );
const XCircleIcon = () => ( <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> );
const UploadIcon = () => ( <svg className="w-10 h-10 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg> );

// --- Main App Component ---
export default function App() {
  const [page, setPage] = useState('landing');
  const [user, setUser] = useState(null);
  const [dashboardData, setDashboardData] = useState({ stats: {}, cases: [] });
  const [selectedCase, setSelectedCase] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const pollingRef = useRef(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);




  const handleLogin = async (email, password) => {
    try {
      setError('');
      setSuccessMessage('');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      setUser(data.user);
      setPage('dashboard');
    } catch (err) {
      setError('Login failed. Please check your credentials.');
      console.error(err);
    }
  };
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPage('landing');
  };

  const handleRegistration = async (email, password) => {
    try {
      setError('');
      setSuccessMessage('');
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Registration failed');
      }

      setSuccessMessage('Registration successful! Please log in.');
      setPage('login');

    } catch (err) {
      const errorMessage = err.message.includes("already registered") 
        ? "This email address is already registered."
        : err.message || 'An unknown error occurred.';
      setError(errorMessage);
    }
  };

  const handleNewAnalysis = async (complaintFile, frlFile) => {
    setPage('processing');
    setError('');
    const formData = new FormData();
    formData.append('complaint_file', complaintFile);
    formData.append('frl_file', frlFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Analysis request failed');
      }
      
      const { job_id } = await response.json();
      pollJobStatus(job_id);

    } catch (err) {
      setError(`Failed to start analysis: ${err.message}`);
      setPage('new_analysis');
    }
  };

  const pollJobStatus = (jobId) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/report/${jobId}`);
        if (!response.ok) throw new Error('Polling failed');
        const data = await response.json();

        if (data.status === 'COMPLETE') {
          clearInterval(pollingRef.current);
          // --- UPDATED to include job_id for the explanation feature ---
          const finalReport = { ...data.report, job_id: jobId };
          console.log("AI REPORT DATA RECEIVED:", JSON.stringify(finalReport, null, 2));
          setReportData(finalReport);
        } else if (data.status === 'ERROR') {
          clearInterval(pollingRef.current);
          setError('An error occurred during the AI analysis pipeline.');
          setPage('dashboard');
        }
      } catch (err) {
        clearInterval(pollingRef.current);
        setError('Lost connection to the server during analysis.');
        setPage('dashboard');
      }
    }, 3000);
  };

  // --- NEW Handler for Explanation Modal ---
  const handleExplainConfidence = async () => {
    if (!reportData || !reportData.job_id) return;
    
    setIsModalOpen(true);
    setIsExplanationLoading(true);

    try {
        const jobId = reportData.job_id;
        const response = await fetch(`${API_BASE_URL}/api/report/${jobId}/explain-confidence`, { method: 'POST' });
        if (!response.ok) throw new Error("Failed to fetch explanation");
        const data = await response.json();
        setExplanation(data.explanation);
    } catch (error) {
        console.error("Failed to get explanation:", error);
        setExplanation(['Could not generate an explanation at this time. Please try again.']);
    } finally {
        setIsExplanationLoading(false);
    }
  };
  
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setUser(data.session.user);
        setPage('dashboard');
      } else {
        setPage('landing');
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setPage('landing');
      }
    });

    return () => {
      subscription.unsubscribe();
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (page === 'dashboard' && user) {
      const fetchData = async () => {
        try {
          const [statsRes, casesRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/dashboard/stats`),
            fetch(`${API_BASE_URL}/api/dashboard/cases`),
          ]);
          if(!statsRes.ok || !casesRes.ok) throw new Error('Failed to fetch dashboard data');

          const stats = await statsRes.json();
          const cases = await casesRes.json();
          setDashboardData({ stats, cases });
          setSelectedCase(cases[0] || null);
        } catch (err) {
          setError('Could not load dashboard data. Is the backend server running?');
        }
      };
      fetchData();
    }
  }, [page, user]);

  useEffect(() => {
    if (reportData) {
      setPage('report');
    }
  }, [reportData]);



  

  const renderPage = () => {
    switch (page) {
      case 'landing': return <LandingPage setPage={setPage} />;
      case 'login': return <LoginPage onLogin={handleLogin} error={error} setPage={setPage} successMessage={successMessage} />;
      case 'register': return <RegistrationPage onRegister={handleRegistration} error={error} setPage={setPage} />;
      case 'dashboard': return <DashboardPage user={user} onLogout={handleLogout} data={dashboardData} selectedCase={selectedCase} setSelectedCase={setSelectedCase} setPage={setPage} error={error} />;
      case 'new_analysis': return <NewAnalysisPage setPage={setPage} onAnalyze={handleNewAnalysis} error={error} />;
      case 'processing': return <ProcessingPage />;
      // --- UPDATED to pass the new handler to ReportPage ---
      case 'report': return <ReportPage reportData={reportData} setPage={setPage} onExplainConfidence={handleExplainConfidence} />;
      default: return <LandingPage setPage={setPage} />;
    }
  };

  return (
    <div className="bg-white min-h-screen font-sans text-brand-charcoal">
      {renderPage()}
      {/* --- RENDER THE MODAL AT THE TOP LEVEL --- */}
      <ExplanationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        explanation={explanation}
        isLoading={isExplanationLoading}
      />
    </div>
  );
}

// --- Page Components ---

function LandingPage({ setPage }) {
    return (
        <div className="flex flex-col min-h-screen">
            <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setPage('landing')}>
                            <LogoIcon />
                            <span className="text-2xl font-bold text-brand-navy">ComplAI</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button onClick={() => setPage('login')} className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-md hover:bg-opacity-90 transition-colors">Login</button>
                            <button className="px-4 py-2 text-sm font-medium text-brand-navy bg-gray-100 rounded-md hover:bg-gray-200 transition-colors">Request a Demo</button>
                        </div>
                    </div>
                </div>
            </nav>
            <main className="flex-grow">
                <section className="py-20 md:py-32 bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <h1 className="text-4xl md:text-6xl font-extrabold text-brand-navy leading-tight">Predict FOS Outcomes with<br /><span className="text-brand-gold">AI-Powered Precision</span></h1>
                        <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600">Our intelligent platform analyzes complaint files and FRLs against thousands of precedents to provide instant compliance audits, risk assessments, and outcome predictions.</p>
                        <div className="mt-10"><button onClick={() => setPage('login')} className="px-8 py-3 text-lg font-semibold text-white bg-brand-gold rounded-md hover:bg-opacity-90 transition-transform transform hover:scale-105">Get Started</button></div>
                    </div>
                </section>
            </main>
            <footer className="bg-brand-navy text-white py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
                    <p>&copy; {new Date().getFullYear()} ComplAI . All Rights Reserved.</p>
                </div>
            </footer>
        </div>
    );
}

function LoginPage({ onLogin, error, setPage, successMessage }) {
  const [email, setEmail] = useState('demo@compl.ai');
  const [password, setPassword] = useState('password');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && password) {
      onLogin(email, password);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-lg">
        <div className="flex flex-col items-center">
            <LogoIcon />
            <h2 className="mt-6 text-3xl font-bold text-center text-brand-navy">ComplAI </h2>
            <p className="mt-2 text-sm text-center text-gray-600">Sign in to access your dashboard</p>
        </div>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        {successMessage && <p className="text-green-500 text-sm text-center">{successMessage}</p>}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input id="email-address" name="email" type="email" autoComplete="email" required className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-brand-gold focus:border-brand-gold sm:text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password-sr" className="sr-only">Password</label>
              <input id="password-sr" name="password" type="password" autoComplete="current-password" required className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-brand-gold focus:border-brand-gold sm:text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <button type="submit" className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-navy border border-transparent rounded-md group hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-gold transition-colors">Sign in</button>
          </div>
        </form>
        <p className="mt-4 text-sm text-center text-gray-600">
          Don't have an account?{' '}
          <button onClick={() => setPage('register')} className="font-medium text-brand-navy hover:underline">
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

function RegistrationPage({ onRegister, error, setPage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && password) {
      onRegister(email, password);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white shadow-lg rounded-lg">
        <div className="flex flex-col items-center">
          <LogoIcon />
          <h2 className="mt-6 text-3xl font-bold text-center text-brand-navy">Create an Account</h2>
          <p className="mt-2 text-sm text-center text-gray-600">Get started with ComplAI</p>
        </div>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address-reg" className="sr-only">Email address</label>
              <input id="email-address-reg" name="email" type="email" required className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-brand-gold focus:border-brand-gold sm:text-sm" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password-reg" className="sr-only">Password</label>
              <input id="password-reg" name="password" type="password" required className="relative block w-full px-3 py-2 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-brand-gold focus:border-brand-gold sm:text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <button type="submit" className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-brand-navy border border-transparent rounded-md group hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-gold transition-colors">
              Sign up
            </button>
          </div>
        </form>
        <p className="mt-4 text-sm text-center text-gray-600">
          Already have an account?{' '}
          <button onClick={() => setPage('login')} className="font-medium text-brand-navy hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

function DashboardPage({ user, onLogout, data, selectedCase, setSelectedCase, setPage, error }) {
    const RiskIndicator = ({ risk }) => {
        const riskStyles = { High: 'bg-red-100 text-red-800', Medium: 'bg-amber-100 text-amber-800', Low: 'bg-green-100 text-green-800' };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${riskStyles[risk] || 'bg-gray-100 text-gray-800'}`}>{risk}</span>;
    };

    return (
        <div className="relative min-h-screen"> {/* Added relative positioning for the FAB */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center space-x-3">
                        <LogoIcon />
                        <h1 className="text-3xl font-bold text-brand-navy">Complaints Dashboard</h1>
                    </div>
                    <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-600">{user?.email}</span>
                        {/* The original button is now less prominent */}
                        {/* <button onClick={() => setPage('new_analysis')} className="px-4 py-2 text-sm font-medium text-brand-navy bg-gray-100 rounded-md hover:bg-gray-200 transition-colors">New Analysis</button> */}
                        <button onClick={onLogout} className="text-sm text-gray-600 hover:text-brand-navy">Logout</button>
                    </div>
                </header>
                
                {error && <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">{error}</div>}

                {/* Stat Cards and Complaint Queue... (No changes here) */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5 mb-8">
                    <StatCard title="Open Complaints" value={data.stats.open_complaints || 0} />
                    <StatCard title="At Risk of FOS" value={`${data.stats.at_risk_fos || 0}`} />
                    <StatCard title="Predicted Uphold" value={`${data.stats.predicted_uphold || 0}%`} />
                    <StatCard title="Avg Readability" value={`${data.stats.avg_frl_readability || 'N/A'}`} />
                    <StatCard title="Avg Time to Close" value={`${data.stats.avg_time_to_close || 0} days`} />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-gray-50 p-6 rounded-lg shadow-inner">
                        <h2 className="text-xl font-semibold text-brand-navy mb-4">Complaint Queue</h2>
                        <div className="space-y-3">
                            {data.cases?.length > 0 ? data.cases.map((c) => (
                                 <div key={c.id} onClick={() => setSelectedCase(c)} className={`p-4 rounded-lg cursor-pointer border-2 transition-all ${selectedCase?.id === c.id ? 'bg-white border-brand-gold shadow-md' : 'bg-white border-transparent hover:border-gray-300'}`}>
                                    <div className="grid grid-cols-5 gap-4 items-center">
                                        <div className="font-bold text-sm text-brand-navy">{c.id}</div>
                                        <div className="text-sm">{c.customer}</div>
                                        <div className="text-sm text-gray-600">{c.product}</div>
                                        <div className="text-sm"><RiskIndicator risk={c.risk} /></div>
                                        <div className={`text-sm font-medium ${c.due === 'Today' || c.due === 'Overdue' ? 'text-red-600' : 'text-gray-500'}`}>{c.due}</div>
                                    </div>
                                </div>
                            )) : <p className="text-center text-gray-500 py-8">No cases found.</p>}
                        </div>
                    </div>

                    {selectedCase ? (
                        <div className="bg-gray-50 p-6 rounded-lg shadow-inner space-y-6">
                            <h2 className="text-xl font-semibold text-brand-navy mb-2">Selected Case Preview</h2>
                             <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h3 className="font-semibold text-sm mb-2 text-gray-700">Summary</h3>
                                <p className="text-sm">{selectedCase.summary}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm">
                                <h3 className="font-semibold text-sm mb-2 text-gray-700">Risk Factors</h3>
                                <ul className="text-sm list-disc list-inside space-y-1">{selectedCase.riskFactors.map((f, i) => <li key={i}>{f}</li>)}</ul>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 p-6 rounded-lg shadow-inner flex items-center justify-center">
                            <p className="text-center text-gray-500">Select a case to see a preview.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- NEW Floating Action Button --- */}
            <button
                onClick={() => setPage('new_analysis')}
                className="fixed bottom-8 right-8 bg-brand-gold text-white p-4 rounded-full shadow-lg hover:bg-opacity-90 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-gold"
                aria-label="Start new analysis"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            </button>
            {/* --- END of FAB --- */}
        </div>
    );
}

function NewAnalysisPage({ setPage, onAnalyze, error }) {
    const [complaintFile, setComplaintFile] = useState(null);
    const [frlFile, setFrlFile] = useState(null);

    const handleAnalyzeClick = () => {
        if (complaintFile && frlFile) {
            onAnalyze(complaintFile, frlFile);
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
             <header className="flex justify-between items-center mb-8">
                <div className="flex items-center space-x-3">
                    <LogoIcon />
                    <h1 className="text-3xl font-bold text-brand-navy">New Case Analysis</h1>
                </div>
                <button onClick={() => setPage('dashboard')} className="text-sm text-gray-600 hover:text-brand-navy">← Back to Dashboard</button>
            </header>
            {error && <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">{error}</div>}
            <div className="bg-gray-50 p-8 rounded-lg shadow-inner space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FileUploadZone title="Complaint Letter" file={complaintFile} setFile={setComplaintFile} />
                    <FileUploadZone title="Final Response Letter (FRL)" file={frlFile} setFile={setFrlFile} />
                </div>
                <div className="flex justify-end">
                    <button onClick={handleAnalyzeClick} disabled={!complaintFile || !frlFile} className="px-6 py-2 font-medium text-white bg-brand-gold rounded-md hover:bg-opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                        Analyze Documents
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProcessingPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-navy"></div>
            <h2 className="mt-6 text-2xl font-semibold text-brand-navy">Analyzing Documents...</h2>
            <p className="mt-2 text-gray-600">The AI is reviewing compliance, assessing risk, and predicting outcomes. Please wait a moment.</p>
        </div>
    );
}

// REPLACE the entire old ReportPage function with this new one
function ReportPage({ reportData, setPage, onExplainConfidence }) { // Added onExplainConfidence prop
    const reportContentRef = useRef(null);
    const navigate = () => setPage('dashboard');

    const handleExportPDF = () => {
        const input = reportContentRef.current;
        if (!input) return;
        html2canvas(input, { scale: 2 }).then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`ComplAI-Report.pdf`);
        });
    };

    if (!reportData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center">
                <h2 className="text-2xl font-semibold text-brand-navy">Loading Report...</h2>
                <p className="mt-2 text-gray-600">If this takes too long, please return to the dashboard.</p>
                <button onClick={() => navigate()} className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-md hover:bg-opacity-90">
                    Back to Dashboard
                </button>
            </div>
        );
    }

    const ComplianceItem = ({ check }) => {
        const compliant = check?.compliant;
        const icon = compliant ? <CheckCircleIcon /> : <XCircleIcon />;
        const color = compliant ? 'text-green-700' : 'text-red-700';
        return (
            <div>
                <div className="flex items-center space-x-2">
                    {icon}
                    <h4 className={`font-semibold ${color}`}>{check?.item || 'Unnamed Check'}: {compliant ? 'Compliant' : 'Non-Compliant'}</h4>
                </div>
                <p className="pl-7 text-sm text-gray-600">{check?.reason || 'No reason provided.'}</p>
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <header className="flex justify-between items-center mb-8 border-b pb-4 border-gray-200">
                <div><h1 className="text-3xl font-bold text-brand-navy">Complaint Report</h1><p className="text-sm text-gray-500 mt-1">Generated by ComplAI</p></div>
                <div className="flex items-center space-x-4">
                    <button onClick={() => navigate()} className="text-sm text-gray-600 hover:text-brand-navy">← Back to Dashboard</button>
                    <button onClick={handleExportPDF} className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-md hover:bg-opacity-90 transition-colors">Download PDF</button>
                </div>
            </header>
            <div ref={reportContentRef} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-4">
                <div className="md:col-span-2 space-y-6">
                    <ReportCard title="Executive Summary"><p>{reportData?.executive_summary || 'N/A'}</p></ReportCard>
                    <ReportCard title="Case Summary"><p>{reportData?.case_summary || 'N/A'}</p></ReportCard>
                    <ReportCard title="FRL Compliance Checks">
                        <div className="space-y-4">
                            {reportData?.frl_compliance_checks?.length > 0 ? (
                                reportData.frl_compliance_checks.map((check, i) => <ComplianceItem key={i} check={check} />)
                            ) : <p>No checks returned.</p>}
                        </div>
                    </ReportCard>
                    <ReportCard title="Recommendations" isGold><p>{reportData?.recommendations || 'N/A'}</p></ReportCard>
                </div>
                <div className="space-y-6">
                    <ReportCard title="Predicted FOS Outcome">
                        <p className="text-lg font-bold text-brand-navy">{reportData?.predicted_fos_outcome?.outcome || 'N/A'}</p>
                        <p><strong>Confidence: </strong>
                            <button onClick={onExplainConfidence} className="text-brand-navy hover:underline cursor-pointer font-semibold">
                                {reportData?.predicted_fos_outcome?.confidence || 'N/A'}
                            </button>
                        </p>
                    </ReportCard>
                    <ReportCard title="Historical Precedent Analysis"><ul className="list-disc list-inside space-y-2">{Array.isArray(reportData?.historical_precedent_analysis) ? reportData.historical_precedent_analysis.map((point, i) => <li key={i}>{point}</li>) : <li>{reportData?.historical_precedent_analysis || 'N/A'}</li>}</ul></ReportCard>
                    <ReportCard title="Key Risk Indicators"><ul className="list-disc list-inside space-y-2">{Array.isArray(reportData?.key_risk_indicators) ? reportData.key_risk_indicators.map((point, i) => <li key={i}>{point}</li>) : <li>{reportData?.key_risk_indicators || 'N/A'}</li>}</ul></ReportCard>
                </div>
            </div>
        </div>
    );
}



function ExplanationModal({ isOpen, onClose, explanation, isLoading }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 transition-opacity duration-300">
      <style>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
      `}</style>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <h2 className="text-xl font-semibold text-brand-navy mb-4">Confidence Score Explanation</h2>
        <div className="text-gray-700 space-y-3 min-h-[100px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
                <p>Generating explanation...</p>
            </div>
          ) : (
            <ul className="list-disc list-inside space-y-2">
              {explanation?.map((point, index) => <li key={index}>{point}</li>) || <li>No explanation available.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---
const StatCard = ({ title, value }) => (
  <div className="bg-white p-5 rounded-lg shadow-md border border-gray-200">
    <h3 className="text-sm font-medium text-gray-500 truncate">{title}</h3>
    <p className="mt-1 text-3xl font-semibold text-brand-navy">{value}</p>
  </div>
);

const FileUploadZone = ({ title, file, setFile }) => {
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };
    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border-2 border-dashed border-gray-300 text-center">
            <label htmlFor={title.replace(/\s+/g, '-')} className="cursor-pointer">
                <h3 className="text-lg font-semibold text-brand-navy mb-2">{title}</h3>
                <UploadIcon />
                {file ? (
                     <p className="mt-2 text-sm font-medium text-green-600">{file.name}</p>
                ) : (
                    <p className="mt-2 text-sm text-gray-500">Drag & drop or click to upload</p>
                )}
                <input id={title.replace(/\s+/g, '-')} type="file" className="sr-only" onChange={handleFileChange} />
            </label>
        </div>
    );
};

const ReportCard = ({ title, children, isGold = false }) => (
    <div className={`bg-white p-5 rounded-lg shadow-md border ${isGold ? 'border-brand-gold' : 'border-gray-200'}`}>
        <h3 className={`text-lg font-semibold mb-3 ${isGold ? 'text-brand-gold' : 'text-brand-navy'}`}>{title}</h3>
        <div className="text-sm space-y-2 text-gray-700">
            {children}
        </div>
    </div>
);