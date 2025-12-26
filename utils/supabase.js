import {createClient} from '@supabase/supabase-js';

class SupabaseService {
    constructor(){
        this.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        this.supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        this.bucket_name = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME || 'markups';
        if (!this.supabase_url || !this.supabase_key) {
            throw new Error('Supabase URL and Key must be provided');
        }
        this.supabase = createClient(this.supabase_url, this.supabase_key);
    }

    async uploadFile(filePath, file) {
        
    }
    async uploadMultipleFiles(files) {

    }
    async getFileUrl(filePath) {

    }
    async deleteFile(filePath) {

    }
    async createUser(email, password) {

    }
    async getUser() {

    }
    async deletUser() {

    }
}