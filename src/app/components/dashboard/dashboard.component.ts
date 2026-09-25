import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { NgApexchartsModule } from 'ng-apexcharts';
import { UserModalComponent } from '../user-modal/user-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NewConnectionModalComponent } from '../new-connection-modal/new-connection-modal.component';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { RecoveryOfficerModalComponent } from '../recovery-officer-modal/recovery-officer-modal.component';
import { AreaModalComponent } from '../area-modal/area-modal.component';
import { CustomerStatusModalComponent } from '../customer-status-modal/customer-status-modal.component';
import { RouterLink } from '@angular/router';
import { MikrotikService, MikrotikServer } from '../../shared/mikrotik.service';
import { ZalDashboardCardComponent } from '../zal-dashboard-card/zal-dashboard-card.component';

export interface MikrotikServerStat {
  id: MikrotikServer;
  label: string;
  ip: string;
  loading: boolean;
  error: string | null;
  total: number;
  active: number;
  disabled: number;
}

interface ChartState {
  categories: string[];
  series: number[] | any[];
  currentPage: number;
  pageSize: number;
  chartOptions: any;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, NgApexchartsModule, RouterLink, ZalDashboardCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  showDashboard = false;
  expandedChartId: string | null = null;
  charts: Record<string, ChartState> = {};

  mikrotikServers: MikrotikServerStat[] = [
    { id: 1, label: '194.1002', ip: '103.66.149.194', loading: true, error: null, total: 0, active: 0, disabled: 0 },
    { id: 2, label: '195.9998', ip: '103.66.149.195', loading: true, error: null, total: 0, active: 0, disabled: 0 },
  ];

  constructor(
    private firestore: Firestore,
    private modalService: NgbModal,
    private mikrotikService: MikrotikService,
  ) {}

  async ngOnInit() {
    this.loadRecoveryDetails();
    this.loadNewConnections();
    this.loadMikrotikStats();
    await this.loadAreaUsersChart();
    await this.loadPackageUsersChart();
    await this.loadBillCollectionChart();
    await this.loadBillCreatorPieChart();
  }

  loadMikrotikStats() {
    this.mikrotikServers.forEach((srv) => {
      srv.loading = true;
      srv.error = null;
      this.mikrotikService.getPppSecrets(srv.id).subscribe({
        next: (users) => {
          srv.total    = users.length;
          srv.active   = users.filter((u) => u.disabled !== 'true' && u.disabled !== 'yes').length;
          srv.disabled = users.filter((u) => u.disabled === 'true' || u.disabled === 'yes').length;
          srv.loading  = false;
        },
        error: (err) => {
          srv.error   = err.message || 'Cannot reach server';
          srv.loading = false;
        },
      });
    });
  }

  activePercent(srv: MikrotikServerStat): number {
    return srv.total ? Math.round((srv.active / srv.total) * 100) : 0;
  }

  /* ================================
      🔥 GENERIC FIRESTORE METHODS
  ================================= */

  async getDocument(path: string) {
    const docRef = doc(this.firestore, path);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  }

  async getCollection(collectionName: string) {
    const colRef = collection(this.firestore, collectionName);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => d.data());
  }

  getTotalAreas(chartId: string): number {
    return this.charts[chartId]?.categories?.length || 0;
  }

  getTotalUsers(chartId: string): number {
    return this.charts[chartId]?.series?.reduce((a, b) => a + b, 0) || 0;
  }

  /* ================================
      📊 GENERIC DATA PROCESSING
  ================================= */

  groupAndCount(data: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};

    data.forEach((item) => {
      const value = item[key];
      if (!result[value]) result[value] = 0;
      result[value]++;
    });

    return result;
  }

  convertToChartArrays(obj: Record<string, number>) {
    return {
      categories: Object.keys(obj),
      series: Object.values(obj),
    };
  }

  paginate(array: any[], page: number, pageSize: number) {
    const start = page * pageSize;
    return array.slice(start, start + pageSize);
  }

  /* ================================
      🎯 CHART INITIALIZER (GENERIC)
  ================================= */

  initializeChart(
    chartId: string,
    categories: string[],
    series: number[],
    title: string,
  ) {
    this.charts[chartId] = {
      categories,
      series,
      currentPage: 0,
      pageSize: 9,
      chartOptions: {},
    };

    this.updateChart(chartId, title);
  }

  updateChart(chartId: string, title: string) {
    const chart = this.charts[chartId];

    const paginatedCategories = this.paginate(
      chart.categories,
      chart.currentPage,
      chart.pageSize,
    );

    const paginatedSeries = this.paginate(
      chart.series,
      chart.currentPage,
      chart.pageSize,
    );

    chart.chartOptions = {
      series: [
        {
          name: title,
          data: paginatedSeries,
        },
      ],
      chart: {
        type: 'bar',
        height: 350,
      },
      plotOptions: {
        bar: {
          distributed: true,
        },
      },
      xaxis: {
        categories: paginatedCategories,
      },
      dataLabels: {
        enabled: true,
      },
      title: {
        text: title,
      },
    };
  }

  nextPage(chartId: string, title: string) {
    const chart = this.charts[chartId];

    if ((chart.currentPage + 1) * chart.pageSize < chart.categories.length) {
      chart.currentPage++;
      this.updateChart(chartId, title);
    }
  }

  prevPage(chartId: string, title: string) {
    const chart = this.charts[chartId];

    if (chart.currentPage > 0) {
      chart.currentPage--;
      this.updateChart(chartId, title);
    }
  }

  /* ================================
      🚀 AREA USERS CHART
  ================================= */

  async loadAreaUsersChart() {
    const users = await this.getCollection('users');

    const grouped = this.groupAndCount(users, 'sublocality');

    const chartData = this.convertToChartArrays(grouped);

    this.initializeChart(
      'areaUsers',
      chartData.categories,
      chartData.series,
      'Users by Area',
    );
  }

  /* ================================
      🚀 LOAD PACKAGE USERS CHART
================================ */

  async loadPackageUsersChart() {
    // 1️⃣ Get all packages from internetPackageDoc
    const packageDocRef = doc(
      this.firestore,
      'internetPackage/internetPackageDoc',
    );
    const packageSnap = await getDoc(packageDocRef);

    let packages: string[] = [];
    if (packageSnap.exists()) {
      const data: any = packageSnap.data();
      packages = data.internetPackage.map((p: any) => p.package_name);
    }

    // 2️⃣ Get users
    const users = await this.getCollection('users');

    // 3️⃣ Count users per package
    const grouped: Record<string, number> = {};
    packages.forEach((pkg) => (grouped[pkg] = 0)); // initialize all packages with 0

    users.forEach((user) => {
      const pkg = user['select_package'];
      if (grouped[pkg] !== undefined) {
        grouped[pkg]++;
      }
    });

    const chartData = this.convertToChartArrays(grouped);

    // 4️⃣ Initialize chart (generic)
    this.initializeChart(
      'packageUsers',
      chartData.categories,
      chartData.series,
      'Users by Package',
    );
  }

  async loadBillCollectionChart() {
    // 1️⃣ Get all users
    const users = await this.getCollection('users');

    // 2️⃣ Prepare month-year sums
    const monthYearMap: Record<string, number> = {};

    users.forEach((user) => {
      if (Array.isArray(user['bills'])) {
        user['bills'].forEach((bill: any) => {
          if (bill.status === 'paid' && bill.collected_amount) {
            const key = `${bill.month}-${bill.year}`.toLowerCase();
            if (!monthYearMap[key]) monthYearMap[key] = 0;
            monthYearMap[key] += bill.collected_amount;
          }
        });
      }
    });

    // 3️⃣ Sort keys by year+month order
    const monthOrder = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];

    const sortedKeys = Object.keys(monthYearMap).sort((a, b) => {
      const [monthA, yearA] = a.split('-');
      const [monthB, yearB] = b.split('-');

      if (parseInt(yearA) !== parseInt(yearB)) {
        return parseInt(yearA) - parseInt(yearB);
      }
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });

    const series = sortedKeys.map((k) => monthYearMap[k]);

    // 4️⃣ Initialize Bill Collection chart (direct ApexCharts object)
    this.charts['billCollection'] = {
      categories: sortedKeys.map((k) => k.toUpperCase()),
      series: series,
      currentPage: 0,
      pageSize: 12,
      chartOptions: {
        series: [
          {
            name: 'Monthly Bill Collection',
            data: series,
          },
        ],
        chart: {
          type: 'line',
          height: 350,
        },
        stroke: {
          curve: 'smooth',
        },
        xaxis: {
          categories: sortedKeys.map((k) => k.toUpperCase()),
        },
        dataLabels: {
          enabled: true,
        },
        title: {
          text: 'Monthly Bill Collection',
        },
        tooltip: {
          y: {
            formatter: (val: number) => 'Rs. ' + val,
          },
        },
      },
    };
  }

  async loadBillCreatorPieChart() {
    const monthOrder = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];

    // 1️⃣ Bill amounts generated (billCreator collection)
    const bills = await this.getCollection('billCreator');
    const generatedMap: Record<string, number> = {};
    bills.forEach((bill: any) => {
      const key = `${bill.month}-${bill.year}`.toLowerCase();
      if (!generatedMap[key]) generatedMap[key] = 0;
      generatedMap[key] += bill.amount || 0;
    });

    // 2️⃣ Bill amounts collected (paid bills inside users collection)
    const users = await this.getCollection('users');
    const collectedMap: Record<string, number> = {};
    users.forEach((user: any) => {
      if (Array.isArray(user['bills'])) {
        user['bills'].forEach((bill: any) => {
          if (bill.status === 'paid' && bill.collected_amount) {
            const key = `${bill.month}-${bill.year}`.toLowerCase();
            if (!collectedMap[key]) collectedMap[key] = 0;
            collectedMap[key] += bill.collected_amount;
          }
        });
      }
    });

    // 3️⃣ Merge and sort all month keys
    const allKeys = Array.from(new Set([...Object.keys(generatedMap), ...Object.keys(collectedMap)]));
    const sortedKeys = allKeys.sort((a, b) => {
      const [monthA, yearA] = a.split('-');
      const [monthB, yearB] = b.split('-');
      if (parseInt(yearA) !== parseInt(yearB)) return parseInt(yearA) - parseInt(yearB);
      return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
    });

    const labels = sortedKeys.map((k) => k.toUpperCase());
    const generatedSeries = sortedKeys.map((k) => generatedMap[k] || 0);
    const collectedSeries = sortedKeys.map((k) => collectedMap[k] || 0);

    // 4️⃣ Mixed chart: bars = generated, line = collected
    this.charts['billCreatorPie'] = {
      categories: labels,
      series: generatedSeries,
      currentPage: 0,
      pageSize: 12,
      chartOptions: {
        series: [
          { name: 'Bills Generated', type: 'column', data: generatedSeries },
          { name: 'Amount Collected', type: 'line',   data: collectedSeries },
        ],
        chart: {
          type: 'line',
          height: 380,
          toolbar: { show: false },
        },
        stroke: {
          width: [0, 3],
          curve: 'smooth',
        },
        plotOptions: {
          bar: { columnWidth: '55%', borderRadius: 4 },
        },
        fill: {
          opacity: [0.85, 1],
        },
        colors: ['#667eea', '#28c76f'],
        xaxis: {
          categories: labels,
          labels: { rotate: -35 },
        },
        yaxis: {
          title: { text: 'Amount (Rs.)' },
          labels: { formatter: (v: number) => 'Rs. ' + v.toLocaleString() },
        },
        dataLabels: { enabled: false },
        legend: { position: 'top' },
        tooltip: {
          shared: true,
          y: { formatter: (val: number) => 'Rs. ' + (val || 0).toLocaleString() },
        },
        title: {
          text: 'Monthly Bill Generation vs Collection',
          style: { fontSize: '13px', fontWeight: '600' },
        },
      },
    };
  }

  goToDashboard() {
    this.showDashboard = true;
  }

  goBack() {
    this.showDashboard = false;
  }

  toggleExpand(chartId: string): void {
    this.expandedChartId = this.expandedChartId === chartId ? null : chartId;
  }

  openUserModal() {
    const modalRef = this.modalService.open(UserModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openNewConnectionModal() {
    const modalRef = this.modalService.open(NewConnectionModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openExpensesModal() {
    const modalRef = this.modalService.open(ExpenseModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openRecoveryOfficerModal() {
    const modalRef = this.modalService.open(RecoveryOfficerModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openAreaDetailsModal() {
    const modalRef = this.modalService.open(AreaModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  openCustomerStatusModal() {
    const modalRef = this.modalService.open(CustomerStatusModalComponent, {
      size: 'xl',
      backdrop: 'static',
    });
  }

  expenses: any[] = [];
  filteredUsers: any[] = [];


  async loadRecoveryDetails() {
  try {
    const usersRef = collection(this.firestore, 'recoveryDetails');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    this.expenses = snapshot.docs
      .map((docSnap) => {
        const data: any = docSnap.data();

        // 🔹 Convert Firestore timestamp to JS Date
        const createdAtDate = data.createdAt?.toDate();

        return {
          id: docSnap.id,
          ...data,
          createdAtDate,
        };
      })
      // ✅ FILTER CURRENT MONTH
      .filter((item) => {
        if (!item.createdAtDate) return false;

        return (
          item.createdAtDate.getMonth() === currentMonth &&
          item.createdAtDate.getFullYear() === currentYear
        );
      })
      // 🔥 AFTER FILTER → calculate values
      .map((data) => {
        const total_expenses =
          (data.total_expenses || 0)

        const profit = (data.total_recovery || 0) - (data.total_expenses || 0);

        return {
          ...data,
          total_expenses,
          profit,
        };
      });

    this.filteredUsers = this.expenses;
    this.calculateTotals(this.expenses);

    console.log('Filtered Monthly Data:', this.expenses);
  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

  totalRecovery: number = 0;
  totalExpenses: number = 0;
  totalProfit: number = 0;

  calculateTotals(data: any[]) {
    this.totalRecovery = data.reduce(
      (sum, item) => sum + (item.total_recovery || 0),
      0,
    );

    this.totalExpenses = data.reduce(
      (sum, item) => sum + (item.total_expenses || 0),
      0,
    );

    this.totalProfit = data.reduce((sum, item) => sum + (item.profit || 0), 0);
  }

  totalNewConnections: number = 0;

 async loadNewConnections() {
  try {
    const usersRef = collection(this.firestore, 'newConnection');
    const q = query(usersRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    const connections = snapshot.docs.map((docSnap) => {
      const data: any = docSnap.data();

      return {
        id: docSnap.id,
        ...data,
        createdAtDate: data.createdAt?.toDate(),
      };
    });

    // ✅ Filter current month
    const currentMonthConnections = connections.filter((item) => {
      if (!item.createdAtDate) return false;

      return (
        item.createdAtDate.getMonth() === currentMonth &&
        item.createdAtDate.getFullYear() === currentYear
      );
    });

    // 🔥 COUNT
    this.totalNewConnections = currentMonthConnections.length;

    console.log('Current Month Connections:', this.totalNewConnections);

  } catch (error) {
    console.error('Error fetching users:', error);
  }
}

filteredBills: any[] = [];
bills: any[] = [];        // ✅ array hona chahiye
totalAmount: number = 0;  // ✅ total amount ke liye

async loadBills() {
  try {
    const billsRef = collection(this.firestore, 'billCreator');
    const snapshot = await getDocs(billsRef);

    const now = new Date();
    const currentMonth = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
    const currentYear = now.getFullYear().toString();

    // ✅ all bills
    this.bills = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // ✅ filter current month (e.g. July)
    this.filteredBills = this.bills.filter((bill: any) => {
      return (
        bill.month?.toLowerCase() === currentMonth &&
        bill.year === currentYear
      );
    });

    // ✅ total amount calculate
    this.totalAmount = this.filteredBills.reduce((sum, bill: any) => {
      return sum + (bill.amount || 0);
    }, 0);

    console.log('Current Month Bills:', this.filteredBills);
    console.log('Total Amount:', this.totalAmount);

  } catch (error) {
    console.error('Error fetching bills:', error);
  }
}
}
