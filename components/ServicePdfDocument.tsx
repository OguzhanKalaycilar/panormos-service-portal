
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Svg, Path, Circle, Font } from '@react-pdf/renderer';
import { ServiceRequest, ServiceNote } from '../types';

// Register a font that supports Turkish characters (Latin-Extended)
Font.register({
  family: 'Roboto',
  fonts: [
    { 
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', 
      fontWeight: 'normal' 
    },
    { 
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', 
      fontWeight: 'bold' 
    }
  ]
});

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Roboto', // Updated to use the custom font
    fontSize: 10,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#d4af37', // Gold color
    paddingBottom: 10,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    marginLeft: 10,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#000',
  },
  companySub: {
    fontSize: 8,
    color: '#d4af37',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  metaSection: {
    textAlign: 'right',
  },
  metaItem: {
    fontSize: 9,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    textTransform: 'uppercase',
    backgroundColor: '#f4f4f5',
    padding: 5,
    borderRadius: 4,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#d4af37',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
    marginBottom: 5,
    paddingBottom: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  col: {
    flex: 1,
  },
  label: {
    fontSize: 8,
    color: '#71717a',
    marginBottom: 1,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  textBlock: {
    fontSize: 9,
    lineHeight: 1.4,
    color: '#3f3f46',
    textAlign: 'justify',
  },
  notesTable: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  priceBox: {
    marginTop: 20,
    alignSelf: 'flex-end',
    width: 200,
    padding: 10,
    backgroundColor: '#fef3c7', // Amber-50
    borderWidth: 1,
    borderColor: '#d4af37',
    borderRadius: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  totalPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#a1a1aa',
    borderTopWidth: 1,
    borderTopColor: '#e4e4e7',
    paddingTop: 10,
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    paddingTop: 10,
  },
  signatureBox: {
    width: '40%',
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 5,
    alignItems: 'center',
  },
});

interface ServicePdfProps {
  request: ServiceRequest;
  notes: ServiceNote[];
}

const ServicePdfDocument: React.FC<ServicePdfProps> = ({ request, notes }) => {
  // Filter only important notes (e.g., from admin or system updates) to keep PDF clean
  const meaningfulNotes = notes.filter(n => n.note && n.note.length > 5).slice(0, 8); 

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoSection}>
            {/* React-PDF SVG Implementation of AnchorLogo */}
            <Svg width="40" height="40" viewBox="0 0 24 24">
               <Circle cx="12" cy="4.5" r="2" stroke="#d4af37" strokeWidth="2" fill="none" />
               <Path d="M6 8.5H18" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round" fill="none" />
               <Path d="M12 6.5V17" stroke="#d4af37" strokeWidth="2.5" fill="none" />
               <Path d="M5 15C5 15 8 20.5 12 20.5C16 20.5 19 15 19 15" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
               <Path d="M5 15L2.5 17.5" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" fill="none" />
               <Path d="M19 15L21.5 17.5" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" fill="none" />
            </Svg>
            <View style={styles.logoText}>
              <Text style={styles.companyName}>PANORMOS TATTOO</Text>
              <Text style={styles.companySub}>PROFESSIONAL TECHNICAL SERVICE</Text>
            </View>
          </View>
          <View style={styles.metaSection}>
            <Text style={styles.metaItem}>Dosya No: #{request.id}</Text>
            <Text style={styles.metaItem}>Tarih: {new Date().toLocaleDateString('tr-TR')}</Text>
            <Text style={styles.metaItem}>Durum: {getStatusLabel(request.status)}</Text>
          </View>
        </View>

        <Text style={styles.title}>TEKNİK SERVİS FORMU</Text>

        {/* INFO GRID */}
        <View style={[styles.section, { flexDirection: 'row', gap: 20 }]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>MÜŞTERİ BİLGİLERİ</Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.label}>AD SOYAD</Text>
              <Text style={styles.value}>{request.full_name}</Text>
            </View>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.label}>TELEFON</Text>
              <Text style={styles.value}>{request.phone}</Text>
            </View>
            <View>
              <Text style={styles.label}>E-POSTA</Text>
              <Text style={styles.value}>{request.email}</Text>
            </View>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>CİHAZ BİLGİLERİ</Text>
            <View style={styles.row}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>MARKA</Text>
                    <Text style={styles.value}>{request.brand}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>MODEL</Text>
                    <Text style={styles.value}>{request.model}</Text>
                </View>
            </View>
            <View style={styles.row}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>ALIM TARİHİ</Text>
                    <Text style={styles.value}>{request.product_date}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>KATEGORİ</Text>
                    <Text style={styles.value}>{request.category}</Text>
                </View>
            </View>
          </View>
        </View>

        {/* PROBLEM DESCRIPTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MÜŞTERİ ARIZA BEYANI</Text>
          <View style={{ backgroundColor: '#f9f9f9', padding: 10, borderRadius: 4 }}>
             <Text style={styles.textBlock}>"{request.description}"</Text>
          </View>
        </View>

        {/* WORKFLOW SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SERVİS İŞLEM ÖZETİ</Text>
          <View style={styles.notesTable}>
             {meaningfulNotes.length > 0 ? meaningfulNotes.map((note, i) => (
                 <View key={i} style={styles.tableRow}>
                     <Text style={{ width: '20%', fontSize: 8, color: '#71717a' }}>
                        {new Date(note.created_at).toLocaleDateString('tr-TR')}
                     </Text>
                     <Text style={{ width: '80%', fontSize: 9 }}>
                        {note.note.replace(/(\r\n|\n|\r)/gm, " ")}
                     </Text>
                 </View>
             )) : (
                 <View style={styles.tableRow}>
                     <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#a1a1aa' }}>Henüz işlem kaydı girilmemiş.</Text>
                 </View>
             )}
          </View>
        </View>

        {/* FINANCIALS */}
        <View style={styles.priceBox}>
            <View style={styles.priceRow}>
                <Text>Servis Bedeli:</Text>
                <Text style={styles.value}>{request.estimated_cost || 0} {request.currency || 'TL'}</Text>
            </View>
            <View style={styles.priceRow}>
                <Text>KDV (%20):</Text>
                <Text style={styles.value}>{((request.estimated_cost || 0) * 0.2).toFixed(2)} {request.currency || 'TL'}</Text>
            </View>
            <View style={[styles.priceRow, { borderTopWidth: 1, borderTopColor: '#d4af37', paddingTop: 5, marginTop: 5 }]}>
                <Text style={{ fontWeight: 'bold' }}>TOPLAM:</Text>
                <Text style={styles.totalPrice}>{((request.estimated_cost || 0) * 1.2).toFixed(2)} {request.currency || 'TL'}</Text>
            </View>
        </View>

        {/* SIGNATURES */}
        <View style={styles.signatureSection}>
            <View style={styles.signatureBox}>
                <Text style={{ fontSize: 9, fontWeight: 'bold' }}>TESLİM EDEN</Text>
                <Text style={{ fontSize: 8, color: '#71717a', marginTop: 30 }}>Panormos Tattoo Teknik Servis</Text>
            </View>
            <View style={styles.signatureBox}>
                <Text style={{ fontSize: 9, fontWeight: 'bold' }}>TESLİM ALAN</Text>
                <Text style={{ fontSize: 8, color: '#71717a', marginTop: 30 }}>{request.full_name}</Text>
            </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>Panormos Tattoo Supply | www.panormostattoo.com | servis@panormostattoo.com</Text>
          <Text style={{ marginTop: 4 }}>Bu belge bilgilendirme amaçlıdır. Servis garantisi sadece işlem yapılan parçaları kapsar (3 Ay).</Text>
        </View>

      </Page>
    </Document>
  );
};

// Helper for labels
function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
        'pending': 'Bekliyor',
        'diagnosing': 'İnceleniyor',
        'pending_approval': 'Onay Bekliyor',
        'approved': 'İşlemde',
        'waiting_parts': 'Parça Bekleniyor',
        'resolved': 'Tamamlandı',
        'shipped': 'Kargolandı',
        'completed': 'Teslim Edildi',
        'rejected': 'İptal / Red'
    };
    return labels[status] || status;
}

export default ServicePdfDocument;
