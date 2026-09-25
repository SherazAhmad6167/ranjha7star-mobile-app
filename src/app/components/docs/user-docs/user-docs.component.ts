import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { addDoc, collection, Firestore, serverTimestamp } from '@angular/fire/firestore';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import * as Papa from 'papaparse';
@Component({
  selector: 'app-user-docs',
  imports: [CommonModule, ToastrModule],
  templateUrl: './user-docs.component.html',
  styleUrl: './user-docs.component.scss'
})
export class UserDocsComponent {
  isLoading = false;

  csvData: any[] = [];
  fileError: string = '';
  loading = false;

  constructor(private firestore: Firestore, private toastr: ToastrService,) {}

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  onFileChange(event: any) {
    const file = event.target.files[0];

    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      this.fileError = 'Only CSV file is allowed!';
      this.csvData = [];
      return;
    }

    this.fileError = '';

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: any) => {
        this.csvData = result.data.map((row: any) => ({
          photoName: '',
          internet_id: row['Internet ID'],
          sublocality: row['Sublocality'] || '',
          user_name: row['User Name'] || '',
          static_ip: row['Static IP'] || '0',
          address: row['Address'] || 'nil',
          mobile_no: row['Phone No'] || '0',
          installation_amount: row['Installation Amount'] || '0',
          other_amount: row['Other Amount'] || '0',
          installation_date: this.formatDate(row['Installation Date']),
          connection_provider: row['Connection Provider']?.toLowerCase() || '',
          connection_type: row['Connection Type']?.toLowerCase() || '',
          select_package: row['Select Internet Package']?.toLowerCase() || '',
          internet_package_fee: Number(row['Internet Package Fee'] || 0),
          cable_discount: row['Discount'] || '',
          cable_package_fee: row['Cable Package Fee'] || '',
          internet_discount: row['Discount'] || 'no_discount',
          sub_area:row['Sub Area'] || '',
          wire: row['Wire'] || '',
          // recharge_date: this.formatDate(row['Recharge Date']),
          latitude: row['Latitude'] ? Number(row['Latitude']) : 0,
          longitude: row['Longitude'] ? Number(row['Longitude']) : 0,
          photo: '',
          pkg_cable: row['Select Cable Package'] || '',
        }));
      }
    });
  }

  downloadSampleCsv() {
    const headers = [
      'Internet ID','User Name','Phone No','Sublocality','Connection Type',
      'Address','Static IP','Installation Date','Connection Provider',
      'Select Internet Package','Internet Package Fee','Installation Amount',
      'Other Amount','Discount','Select Cable Package','Cable Package Fee',
      'Sub Area','Wire','Latitude','Longitude'
    ];
    const rows = [
      ['INT-001','Ali Khan','03001234567','Gulberg','internet','House 12 Street 5','','2024-01-15','PTCL','N-10mbps','2000','5000','0','no_discount','','','Block A','fiber','31.5204','74.3587'],
      ['INT-002','Sara Ahmed','03211234567','DHA Phase 5','both','Flat 3B Sector 7','192.168.1.10','2024-02-20','Fiberlink','Fs-12mbps','3000','7000','0','no_discount','cable_basic','1000','Block C','fiber','31.5496','74.3436'],
      ['INT-003','Bilal Raza','03451234567','Johar Town','internet','Shop 5 Main Market','','2024-03-10','Zong','Zong-8mbps','2500','6000','0','no_discount','','','','copper','31.4697','74.2728'],
    ];
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample_users.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async uploadToFirestore() {
    if (this.csvData.length === 0) return;

    this.loading = true;

    try {
      const usersRef = collection(this.firestore, 'users');

      for (const row of this.csvData) {
        await addDoc(usersRef, {
          ...row,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      this.toastr.success('Data uploaded successfully');
      this.csvData = [];

    } catch (error) {
      console.error(error);
      this.toastr.error('Upload failed');
    }

    this.loading = false;
  }

}
