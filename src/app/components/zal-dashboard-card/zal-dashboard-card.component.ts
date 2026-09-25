import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ZalService, ZalStats } from '../../shared/zal.service';

/**
 * ZalUltra branch summary for the dashboard. Its own component so the panel's
 * styles do not count against the dashboard's per-component style budget.
 */
@Component({
  selector: 'app-zal-dashboard-card',
  imports: [CommonModule, RouterLink],
  templateUrl: './zal-dashboard-card.component.html',
  styleUrl: './zal-dashboard-card.component.scss',
})
export class ZalDashboardCardComponent implements OnInit {
  zal: { loading: boolean; error: string | null; stats: ZalStats | null } = {
    loading: true,
    error: null,
    stats: null,
  };

  constructor(private zalService: ZalService) {}

  ngOnInit() {
    this.loadZalStats();
  }

  loadZalStats() {
    this.zal.loading = true;
    this.zal.error = null;

    this.zalService.getStats().subscribe({
      next: (stats) => {
        this.zal.stats = stats;
        this.zal.loading = false;
      },
      error: (err) => {
        this.zal.error = err?.message || 'Cannot reach the ZalUltra panel';
        this.zal.loading = false;
      },
    });
  }

  /** Share of the branch total, for the bar widths. */
  zalPercent(value: any): number {
    const total = Number(this.zal.stats?.total || 0);
    if (!total) return 0;
    return Math.round((Number(value || 0) / total) * 1000) / 10;
  }

  zalNum(value: any): number {
    return Number(value || 0);
  }
}
