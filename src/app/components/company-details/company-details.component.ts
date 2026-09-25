import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-company-details',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './company-details.component.html',
  styleUrl: './company-details.component.scss',
})
export class CompanyDetailsComponent {
  companyForm: FormGroup;
  isLoading = false;
  logoFile: File | null = null;
  logoPreview: string | ArrayBuffer | null = null;
  readonly docId = 'companyDetail'; // Firestore doc id

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private toastr: ToastrService,
  ) {
    this.companyForm = this.fb.group({
      id: [{ value: '', disabled: true }],
      companyName: ['', Validators.required],
      address: ['', Validators.required],
      phone1: ['', Validators.required],
      phone2: [''],
      complain_no1: [''],
      complain_no2: [''],
      email: [''],
      description: [''],
      logo: [''],
    });
  }

  ngOnInit(): void {
    this.loadCompanyDetails();
  }

  async loadCompanyDetails() {
    this.isLoading = true;
    try {
      const ref = doc(this.firestore, 'companyDetail', this.docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data: any = snap.data();
        this.companyForm.patchValue({
          id: data.id,
          companyName: data.companyName,
          address: data.address,
          phone1: data.phone1,
          phone2: data.phone2,
          complain_no1: data.complain_no1,
          complain_no2: data.complain_no2,
          email: data.email,
          description: data.description,
          logo: data.logo || '',
        });

        if (data.logo) {
          this.logoPreview = data.logo;
        }
      } else {
        this.companyForm.patchValue({ id: new Date().getTime() }); // Generate ID if none
      }
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load company details');
    } finally {
      this.isLoading = false;
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate image type
    if (!file.type.startsWith('image/')) {
      this.toastr.error('Only image files are allowed');
      return;
    }

    // Resize & compress logo
    this.resizeAndCompressImage(file, 400, 400, 0.7)
      .then((base64) => {
        this.logoPreview = base64; // show preview
        this.logoFile = file; // optional, if you want original file somewhere

        // Patch reactive form
        this.companyForm.patchValue({
          logo: base64,
        });
      })
      .catch((err) => {
        console.error('Image processing error', err);
        this.toastr.error('Failed to process image');
      });
  }

  /**
   * Resize and compress image to base64
   */
  resizeAndCompressImage(
    file: File,
    maxWidth: number,
    maxHeight: number,
    quality: number = 0.7,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;

        img.onload = () => {
          let { width, height } = img;

          // Maintain aspect ratio
          const aspect = width / height;
          if (width > maxWidth) {
            width = maxWidth;
            height = Math.round(width / aspect);
          }
          if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * aspect);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('Canvas not supported');

          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };

        img.onerror = (err) => reject(err);
      };

      reader.onerror = (err) => reject(err);
    });
  }

  async saveCompanyDetails() {
    if (this.companyForm.invalid) return;

    this.isLoading = true;
    try {
      const data = {
        ...this.companyForm.value,
        id: this.companyForm.get('id')?.value,
        logo: this.logoPreview || '',
      };

      await setDoc(doc(this.firestore, 'companyDetail', this.docId), data);
      this.toastr.success('Company details saved successfully!');
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to save company details');
    } finally {
      this.isLoading = false;
    }
  }
}
