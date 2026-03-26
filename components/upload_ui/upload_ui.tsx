'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { storageService } from '@/lib/supabase';

type UploadedFile = { url: string; path: string; name: string };

interface UploadUiProps {
	bucketName?: string;
	folder?: string;
	onUploadComplete?: (files: UploadedFile[]) => void;
	onUploadError?: (error: Error) => void;
	allowedFileTypes?: string[];
	maxFileSize?: number;
	maxNumberOfFiles?: number;
}

function isAllowedType(file: File, allowedFileTypes: string[]) {
	if (allowedFileTypes.length === 0) return true;

	return allowedFileTypes.some((allowed) => {
		if (allowed.endsWith('/*')) {
			const category = allowed.split('/')[0];
			return file.type.startsWith(`${category}/`);
		}
		return file.type === allowed;
	});
}

export default function UploadUi({
	bucketName,
	folder = 'uploads',
	onUploadComplete,
	onUploadError,
	allowedFileTypes = ['image/*'],
	maxFileSize = 10 * 1024 * 1024,
	maxNumberOfFiles = 10,
}: UploadUiProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);

	const handleSelectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const allFiles = Array.from(event.target.files ?? []);
		if (allFiles.length === 0) return;

		if (allFiles.length > maxNumberOfFiles) {
			const error = new Error(`You can upload up to ${maxNumberOfFiles} files at once.`);
			onUploadError?.(error);
			return;
		}

		const validFiles = allFiles.filter((file) => {
			const typeOk = isAllowedType(file, allowedFileTypes);
			const sizeOk = file.size <= maxFileSize;
			return typeOk && sizeOk;
		});

		if (validFiles.length !== allFiles.length) {
			const error = new Error('Some files were rejected due to type or size limits.');
			onUploadError?.(error);
			if (validFiles.length === 0) return;
		}

		setIsUploading(true);
		try {
			// `bucketName` is accepted for API compatibility with callers.
			void bucketName;

			const result = await storageService.uploadMultipleFiles(validFiles, folder);

			if (result.failedUploads.length > 0 && result.successfulUploads.length === 0) {
				throw new Error(result.failedUploads[0].error?.message || 'Upload failed');
			}

			const uploaded: UploadedFile[] = result.successfulUploads.map((file) => ({
				url: file.publicUrl,
				path: file.path,
				name: file.path.split('/').pop() || 'uploaded-file',
			}));

			onUploadComplete?.(uploaded);

			if (result.failedUploads.length > 0) {
				onUploadError?.(new Error(`${result.failedUploads.length} file(s) failed to upload.`));
			}
		} catch (error) {
			onUploadError?.(error instanceof Error ? error : new Error('Upload failed'));
		} finally {
			setIsUploading(false);
			if (inputRef.current) inputRef.current.value = '';
		}
	};

	return (
		<div className="space-y-4">
			<input
				ref={inputRef}
				type="file"
				className="hidden"
				multiple
				accept={allowedFileTypes.join(',')}
				onChange={handleSelectFiles}
			/>

			<button
				type="button"
				disabled={isUploading}
				onClick={() => inputRef.current?.click()}
				className="w-full rounded-lg border border-dashed border-border p-10 text-center hover:bg-muted transition-colors disabled:opacity-60"
			>
				<div className="flex flex-col items-center gap-2">
					<Upload className="h-8 w-8 text-muted-foreground" />
					<p className="text-sm font-medium">{isUploading ? 'Uploading...' : 'Click to select files'}</p>
					<p className="text-xs text-muted-foreground">
						Up to {maxNumberOfFiles} files, max {Math.round(maxFileSize / (1024 * 1024))}MB each
					</p>
				</div>
			</button>
		</div>
	);
}