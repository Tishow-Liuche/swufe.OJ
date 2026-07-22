#include<bits/stdc++.h>
using namespace std;


bool is_prime(long long n){
    if(n < 2) return false;
    if(n == 2) return true;
    for(int i = 2;i * i <= n;i ++){
        if(n%i == 0) return false;
    }
    return true;
}

void solve(){
    long long a = 0,b = 0,c = 0;
    for(int i = 0;i < 3;i ++){
        for(int j = 0;j < 3;j ++){
            long long d;cin >> d;
            if(i == 0) a += d,b += d;
            if(i == 2) a += d,b -= d;
            c += d;
        }
    }
    string s;cin >> s;
    if(s == "0"){
        if(is_prime(c)) cout << "YES" << endl;
        else cout << "NO" << endl;
    }else if(s[s.length()-1] == '1'){
        if(is_prime(b)) cout << "YES" << endl;
        else cout << "NO" << endl;
    }else{
        if(is_prime(a)) cout << "YES" << endl;
        else cout << "NO" << endl;
    }

}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0);cout.tie(0);
    solve();
    return 0;
}
