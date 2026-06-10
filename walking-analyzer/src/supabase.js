import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rsltxopvsobompabrqrn.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzbHR4b3B2c29ib21wYWJycXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTk0NTksImV4cCI6MjA5NjQ5NTQ1OX0.npUm2mGOWeh2HIC8dDEEpVqlIN5cpphv7Fs_BSQwfk4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
