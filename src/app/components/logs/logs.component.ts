import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { UserDetailLogComponent } from "./user-detail-log/user-detail-log.component";
import { AreaLogComponent } from './area-log/area-log.component';
import { RecoveryOfficerLogComponent } from './recovery-officer-log/recovery-officer-log.component';
import { PackageLogComponent } from './package-log/package-log.component';
import { BillCreatorLogComponent } from './bill-creator-log/bill-creator-log.component';

@Component({
  selector: 'app-logs',
  imports: [CommonModule, UserDetailLogComponent, AreaLogComponent, RecoveryOfficerLogComponent, PackageLogComponent, BillCreatorLogComponent],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss'
})
export class LogsComponent {
activeTab: 'user' | 'area' | 'package' | 'recovery' | 'bill' = 'user';
}
