import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonCard, IonCardContent } from '@ionic/angular';

type HomeCard = {
  title: string;
  subtitle: string;
  eyebrow: string;
  path: string;
  icon: string;
  tone: 'blue' | 'emerald' | 'amber' | 'violet' | 'indigo';
  /** Spans the whole grid row with a horizontal layout. */
  wide?: boolean;
};

@Component({
  selector: 'app-mobile-home',
  imports: [CommonModule, RouterLink, IonCard, IonCardContent],
  templateUrl: './mobile-home.component.html',
  styleUrl: './mobile-home.component.scss',
})
export class MobileHomeComponent {
  readonly today = new Date();
  readonly greeting = this.buildGreeting();

  readonly cards: HomeCard[] = [
    {
      title: 'User Details',
      subtitle: 'Search customers, packages and profiles',
      eyebrow: 'Subscribers',
      path: '/user-details',
      icon: 'ri-user-3-fill',
      tone: 'blue',
    },
    {
      title: 'New Connection',
      subtitle: 'Create requests and verify documents',
      eyebrow: 'Activation',
      path: '/new-connection',
      icon: 'ri-user-add-fill',
      tone: 'emerald',
    },
    {
      title: 'User Collection',
      subtitle: 'Post payments and review records',
      eyebrow: 'Payments',
      path: '/user-collections',
      icon: 'ri-wallet-3-fill',
      tone: 'amber',
    },
    {
      title: 'Recovery Details',
      subtitle: 'Track follow-ups and recovery status',
      eyebrow: 'Recovery',
      path: '/recovery-details',
      icon: 'ri-hand-coin-fill',
      tone: 'violet',
    },
    {
      title: 'ZAL Ultra',
      subtitle: 'Panel subscribers, renewals and internet on / off',
      eyebrow: 'Network',
      path: '/zal-subscribers',
      icon: 'ri-server-fill',
      tone: 'indigo',
      wide: true,
    },
  ];

  private buildGreeting(): string {
    const hour = this.today.getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = (localStorage.getItem('name') || localStorage.getItem('username') || '')
      .trim()
      .split(/\s+/)[0];
    return name ? `${part}, ${name}` : part;
  }
}
